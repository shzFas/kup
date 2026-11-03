package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"

	"kup/pkg/httpx"
)

const (
	maxUpload   = 10 << 20
	maxPixels   = 50_000_000
	fullSize    = 1600
	thumbSize   = 480
	jpegQuality = 82
	photoPrefix = "photos/"
)

func photoURL(id string, thumb bool) string {
	if thumb {
		return "/media/" + photoPrefix + id + "_t.jpg"
	}
	return "/media/" + photoPrefix + id + ".jpg"
}

func (s *server) uploadPhoto(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload+1<<20)
	file, _, err := r.FormFile("file")
	if err != nil {
		return httpx.Err(400, "bad_file", "file_missing")
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxUpload+1))
	if err != nil || len(data) > maxUpload {
		return httpx.Err(413, "too_large", "file_too_large")
	}

	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return httpx.Err(400, "bad_format", "file_format")
	}
	if cfg.Width*cfg.Height > maxPixels {
		return httpx.Err(400, "too_big", "image_too_big")
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return httpx.Err(400, "bad_format", "image_broken")
	}
	if format == "jpeg" {
		img = applyOrientation(img, jpegOrientation(data))
	}
	// Re-encoding drops EXIF (including GPS) on purpose.
	full := encodeJPEG(resize(img, fullSize))
	thumb := encodeJPEG(resize(img, thumbSize))

	id := uuid.NewString()
	ctx := r.Context()
	for _, f := range []struct {
		key  string
		data []byte
	}{{photoPrefix + id + ".jpg", full}, {photoPrefix + id + "_t.jpg", thumb}} {
		_, err := s.s3.PutObject(ctx, s.bucket, f.key, bytes.NewReader(f.data), int64(len(f.data)),
			minio.PutObjectOptions{ContentType: "image/jpeg", CacheControl: "public, max-age=31536000, immutable"})
		if err != nil {
			return err
		}
	}
	b := img.Bounds()
	if _, err := s.db.Exec(ctx, `INSERT INTO photos(id, user_id, width, height) VALUES ($1,$2,$3,$4)`, id, uid, b.Dx(), b.Dy()); err != nil {
		return err
	}
	httpx.JSON(w, 201, map[string]string{"id": id, "url": photoURL(id, false)})
	return nil
}

func encodeJPEG(img image.Image) []byte {
	var buf bytes.Buffer
	_ = jpeg.Encode(&buf, img, &jpeg.Options{Quality: jpegQuality})
	return buf.Bytes()
}

// resize scales img so its longer side is at most max.
func resize(img image.Image, max int) image.Image {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= max && h <= max {
		return toRGBA(img)
	}
	if w >= h {
		h = h * max / w
		w = max
	} else {
		w = w * max / h
		h = max
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Src, nil)
	return dst
}

func toRGBA(img image.Image) *image.RGBA {
	b := img.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(dst, dst.Bounds(), img, b.Min, draw.Src)
	return dst
}

// jpegOrientation reads the EXIF orientation tag (1–8). Returns 1 if absent.
func jpegOrientation(data []byte) int {
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return 1
	}
	i := 2
	for i+4 <= len(data) {
		if data[i] != 0xFF {
			return 1
		}
		marker := data[i+1]
		size := int(binary.BigEndian.Uint16(data[i+2:]))
		if marker == 0xDA || size < 2 || i+2+size > len(data) {
			return 1 // start of scan or broken segment
		}
		seg := data[i+4 : i+2+size]
		if marker == 0xE1 && len(seg) > 14 && string(seg[:6]) == "Exif\x00\x00" {
			return tiffOrientation(seg[6:])
		}
		i += 2 + size
	}
	return 1
}

func tiffOrientation(t []byte) int {
	if len(t) < 8 {
		return 1
	}
	var bo binary.ByteOrder
	switch string(t[:2]) {
	case "II":
		bo = binary.LittleEndian
	case "MM":
		bo = binary.BigEndian
	default:
		return 1
	}
	off := int(bo.Uint32(t[4:]))
	if off+2 > len(t) {
		return 1
	}
	n := int(bo.Uint16(t[off:]))
	for k := 0; k < n; k++ {
		e := off + 2 + k*12
		if e+12 > len(t) {
			return 1
		}
		if bo.Uint16(t[e:]) == 0x0112 {
			if v := int(bo.Uint16(t[e+8:])); v >= 1 && v <= 8 {
				return v
			}
			return 1
		}
	}
	return 1
}

// applyOrientation rotates/flips img so it displays upright.
func applyOrientation(img image.Image, o int) image.Image {
	if o <= 1 || o > 8 {
		return img
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	dw, dh := w, h
	if o >= 5 {
		dw, dh = h, w
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var dx, dy int
			switch o {
			case 2:
				dx, dy = w-1-x, y
			case 3:
				dx, dy = w-1-x, h-1-y
			case 4:
				dx, dy = x, h-1-y
			case 5:
				dx, dy = y, x
			case 6:
				dx, dy = h-1-y, x
			case 7:
				dx, dy = h-1-y, w-1-x
			case 8:
				dx, dy = y, w-1-x
			}
			dst.Set(dx, dy, img.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}
