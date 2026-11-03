// Package i18n resolves the request language and holds server-side texts.
// Supported languages: ru (default, main audience), uk, cs, en.
package i18n

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type Lang string

const (
	RU Lang = "ru"
	UK Lang = "uk"
	CS Lang = "cs"
	EN Lang = "en"

	Default = RU
)

// All lists supported languages in display order.
var All = []Lang{RU, UK, CS, EN}

// Parse picks the first supported language from an Accept-Language-like value.
func Parse(s string) Lang {
	for _, part := range strings.Split(strings.ToLower(s), ",") {
		part = strings.TrimSpace(part)
		if i := strings.IndexAny(part, ";-_"); i >= 0 {
			part = part[:i]
		}
		switch part {
		case "ru", "be", "kk":
			return RU
		case "uk":
			return UK
		case "cs", "sk":
			return CS
		case "en":
			return EN
		}
	}
	return Default
}

// Valid reports whether s is exactly a supported language code.
func Valid(s string) bool {
	for _, l := range All {
		if string(l) == s {
			return true
		}
	}
	return false
}

// FromRequest reads the language from Accept-Language.
func FromRequest(r *http.Request) Lang { return Parse(r.Header.Get("Accept-Language")) }

// Text is a localized string. In JSON it is either a plain string (same in all
// languages) or an object {"ru": "...", "uk": "...", "cs": "...", "en": "..."}.
type Text map[Lang]string

func (t *Text) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		*t = Text{}
		for _, l := range All {
			(*t)[l] = s
		}
		return nil
	}
	var m map[Lang]string
	if err := json.Unmarshal(b, &m); err != nil {
		return fmt.Errorf("localized text must be a string or {ru,uk,cs,en}: %w", err)
	}
	for _, l := range All {
		if strings.TrimSpace(m[l]) == "" {
			return fmt.Errorf("localized text %v: missing %q", m, l)
		}
	}
	*t = m
	return nil
}

// Get returns the text in lang, falling back to English, then Russian.
func (t Text) Get(l Lang) string {
	if v, ok := t[l]; ok && v != "" {
		return v
	}
	if v := t[EN]; v != "" {
		return v
	}
	return t[RU]
}

// Ptr returns a pointer to the localized value, or nil if t is empty.
func (t Text) Ptr(l Lang) *string {
	if len(t) == 0 {
		return nil
	}
	v := t.Get(l)
	return &v
}

// T formats a server message by key. Unknown keys return the key itself.
func T(l Lang, key string, args ...any) string {
	m, ok := messages[key]
	if !ok {
		return key
	}
	s := m.Get(l)
	if len(args) > 0 {
		return fmt.Sprintf(s, args...)
	}
	return s
}

func tx(ru, uk, cs, en string) Text { return Text{RU: ru, UK: uk, CS: cs, EN: en} }

var messages = map[string]Text{
	// generic
	"not_found":       tx("Не найдено", "Не знайдено", "Nenalezeno", "Not found"),
	"forbidden":       tx("Нет доступа", "Немає доступу", "Přístup odepřen", "Access denied"),
	"unauthorized":    tx("Требуется вход", "Потрібно увійти", "Je nutné se přihlásit", "Please sign in"),
	"session_expired": tx("Сессия истекла, войдите снова", "Сесія закінчилася, увійдіть знову", "Relace vypršela, přihlaste se znovu", "Session expired, please sign in again"),
	"internal":        tx("Внутренняя ошибка, попробуйте позже", "Внутрішня помилка, спробуйте пізніше", "Interní chyba, zkuste to později", "Internal error, please try again later"),
	"unavailable":     tx("Сервис временно недоступен", "Сервіс тимчасово недоступний", "Služba je dočasně nedostupná", "Service temporarily unavailable"),
	"rate_limited":    tx("Слишком много запросов, подождите немного", "Забагато запитів, зачекайте трохи", "Příliš mnoho požadavků, chvíli počkejte", "Too many requests, please wait"),
	"bad_json":        tx("Некорректный запрос", "Некоректний запит", "Neplatný požadavek", "Invalid request"),
	"check_fields":    tx("Проверьте заполнение полей", "Перевірте заповнення полів", "Zkontrolujte vyplněná pole", "Please check the fields"),

	// auth
	"phone_format": tx("Введите номер в международном формате, например +420 777 123 456", "Введіть номер у міжнародному форматі, напр. +420 777 123 456", "Zadejte číslo v mezinárodním formátu, např. +420 777 123 456", "Enter the number in international format, e.g. +420 777 123 456"),
	"otp_wait":     tx("Повторно запросить код можно через %d сек.", "Повторно запросити код можна через %d с", "Nový kód si můžete vyžádat za %d s", "You can request a new code in %d s"),
	"otp_invalid":  tx("Неверный или просроченный код", "Невірний або прострочений код", "Neplatný nebo prošlý kód", "Invalid or expired code"),
	"otp_sms":      tx("Код для входа в kup: %s", "Код для входу в kup: %s", "Kód pro přihlášení do kup: %s", "Your kup sign-in code: %s"),
	"name_length":  tx("Имя от 1 до 60 символов", "Ім'я від 1 до 60 символів", "Jméno musí mít 1–60 znaků", "Name must be 1–60 characters"),
	"lang_invalid": tx("Неподдерживаемый язык", "Непідтримувана мова", "Nepodporovaný jazyk", "Unsupported language"),
	"default_user": tx("Пользователь", "Користувач", "Uživatel", "User"),

	// listings: fields
	"required":          tx("Обязательное поле", "Обов'язкове поле", "Povinné pole", "Required"),
	"unknown_field":     tx("Неизвестное поле", "Невідоме поле", "Neznámé pole", "Unknown field"),
	"enter_number":      tx("Введите число", "Введіть число", "Zadejte číslo", "Enter a number"),
	"enter_integer":     tx("Введите целое число", "Введіть ціле число", "Zadejte celé číslo", "Enter a whole number"),
	"min":               tx("Минимум %s", "Мінімум %s", "Minimálně %s", "Minimum %s"),
	"max":               tx("Максимум %s", "Максимум %s", "Maximálně %s", "Maximum %s"),
	"choose_option":     tx("Выберите значение из списка", "Виберіть значення зі списку", "Vyberte hodnotu ze seznamu", "Choose a value from the list"),
	"expect_list":       tx("Ожидается список", "Очікується список", "Očekává se seznam", "A list is expected"),
	"bad_value":         tx("Недопустимое значение", "Неприпустиме значення", "Nepřípustná hodnota", "Invalid value"),
	"expect_bool":       tx("Ожидается да/нет", "Очікується так/ні", "Očekává se ano/ne", "Yes/no expected"),
	"parent_mismatch":   tx("Не подходит к выбранному значению поля «%s»", "Не відповідає вибраному значенню поля «%s»", "Neodpovídá zvolené hodnotě pole „%s“", "Doesn't match the selected “%s”"),
	"expect_text":       tx("Ожидается текст", "Очікується текст", "Očekává se text", "Text expected"),
	"text_200":          tx("Не более 200 символов", "Не більше 200 символів", "Maximálně 200 znaků", "At most 200 characters"),
	"vin_format":        tx("VIN — 17 символов (латиница без I, O, Q и цифры)", "VIN — 17 символів (латиниця без I, O, Q та цифри)", "VIN má 17 znaků (písmena bez I, O, Q a číslice)", "VIN has 17 characters (letters except I, O, Q, and digits)"),
	"unsupported_type":  tx("Неподдерживаемый тип", "Непідтримуваний тип", "Nepodporovaný typ", "Unsupported type"),
	"category_fixed":    tx("Категорию нельзя изменить", "Категорію не можна змінити", "Kategorii nelze změnit", "The category can't be changed"),
	"category_unknown":  tx("Неизвестная категория", "Невідома категорія", "Neznámá kategorie", "Unknown category"),
	"category_choose":   tx("Выберите категорию", "Виберіть категорію", "Vyberte kategorii", "Choose a category"),
	"price_integer":     tx("Укажите цену целым числом", "Вкажіть ціну цілим числом", "Zadejte cenu celým číslem", "Enter the price as a whole number"),
	"price_required":    tx("Укажите цену", "Вкажіть ціну", "Zadejte cenu", "Enter the price"),
	"currency_only":     tx("Поддерживается только %s", "Підтримується лише %s", "Podporována je pouze %s", "Only %s is supported"),
	"city_choose":       tx("Выберите город", "Виберіть місто", "Vyberte město", "Choose a city"),
	"desc_5000":         tx("Не более 5000 символов", "Не більше 5000 символів", "Maximálně 5000 znaků", "At most 5000 characters"),
	"desc_links":        tx("Ссылки в описании запрещены", "Посилання в описі заборонені", "Odkazy v popisu nejsou povoleny", "Links are not allowed in the description"),
	"bad_location":      tx("Некорректные координаты", "Некоректні координати", "Neplatné souřadnice", "Invalid coordinates"),
	"photos_max":        tx("Не более 20 фото", "Не більше 20 фото", "Maximálně 20 fotografií", "At most 20 photos"),
	"photos_bad":        tx("Некорректный список фото", "Некоректний список фото", "Neplatný seznam fotografií", "Invalid photo list"),
	"photos_missing":    tx("Фото не найдены — загрузите их заново", "Фото не знайдено — завантажте їх знову", "Fotografie nenalezeny — nahrajte je znovu", "Photos not found — please upload them again"),
	"floor_above_total": tx("Этаж не может быть выше этажности дома", "Поверх не може бути вищим за поверховість будинку", "Podlaží nemůže být vyšší než počet podlaží domu", "Floor can't be higher than the number of floors"),
	"status_allowed":    tx("Допустимо: active, archived, sold", "Допустимо: active, archived, sold", "Povoleno: active, archived, sold", "Allowed: active, archived, sold"),
	"listing_inactive":  tx("Объявление снято с публикации", "Оголошення знято з публікації", "Inzerát již není aktivní", "The listing is no longer active"),
	"listing_blocked":   tx("Объявление заблокировано модератором", "Оголошення заблоковано модератором", "Inzerát zablokoval moderátor", "The listing was blocked by a moderator"),
	"report_reason":     tx("Выберите причину", "Виберіть причину", "Vyberte důvod", "Choose a reason"),
	"comment_1000":      tx("Не более 1000 символов", "Не більше 1000 символів", "Maximálně 1000 znaků", "At most 1000 characters"),
	"report_own":        tx("Нельзя пожаловаться на своё объявление", "Не можна поскаржитися на своє оголошення", "Nelze nahlásit vlastní inzerát", "You can't report your own listing"),
	"default_block":     tx("Нарушение правил размещения", "Порушення правил розміщення", "Porušení pravidel inzerce", "Violation of listing rules"),

	// media
	"file_missing":   tx("Файл не получен или больше 10 МБ", "Файл не отримано або більший за 10 МБ", "Soubor chybí nebo je větší než 10 MB", "No file or file larger than 10 MB"),
	"file_too_large": tx("Файл больше 10 МБ", "Файл більший за 10 МБ", "Soubor je větší než 10 MB", "File is larger than 10 MB"),
	"file_format":    tx("Поддерживаются JPEG, PNG и WebP", "Підтримуються JPEG, PNG і WebP", "Podporované formáty: JPEG, PNG a WebP", "Supported formats: JPEG, PNG and WebP"),
	"image_too_big":  tx("Слишком большое изображение", "Завелике зображення", "Obrázek je příliš velký", "Image is too large"),
	"image_broken":   tx("Не удалось прочитать изображение", "Не вдалося прочитати зображення", "Obrázek se nepodařilo načíst", "Couldn't read the image"),

	// listing texts
	"yes":       tx("Да", "Так", "Ano", "Yes"),
	"no":        tx("Нет", "Ні", "Ne", "No"),
	"per_month": tx("/мес", "/міс", "/měs.", "/mo"),
	"floor_of":  tx("%d/%d эт.", "%d/%d пов.", "%d/%d p.", "floor %d/%d"),
	"apt_title": tx("Квартира %s, %s, %s", "Квартира %s, %s, %s", "Byt %s, %s, %s", "Apartment %s, %s, %s"),

	// search
	"query_long":     tx("Слишком длинный запрос", "Задовгий запит", "Příliš dlouhý dotaz", "Query too long"),
	"geo_invalid":    tx("Некорректные параметры гео-фильтра", "Некоректні параметри геофільтра", "Neplatné parametry geofiltru", "Invalid geo filter"),
	"filter_unknown": tx("Неизвестный фильтр: %s", "Невідомий фільтр: %s", "Neznámý filtr: %s", "Unknown filter: %s"),
	"filter_bad":     tx("Фильтр %s: %s", "Фільтр %s: %s", "Filtr %s: %s", "Filter %s: %s"),
	"sort_unknown":   tx("Неизвестная сортировка", "Невідоме сортування", "Neznámé řazení", "Unknown sort"),
	"facet_bad":      tx("Фасет недоступен: %s", "Фасет недоступний: %s", "Faseta není k dispozici: %s", "Facet not available: %s"),

	// saved searches & notifications
	"saved_limit":      tx("Можно сохранить не больше 50 поисков", "Можна зберегти не більше 50 пошуків", "Uložit lze nejvýše 50 hledání", "You can save at most 50 searches"),
	"notif_new_title":  tx("Новое по поиску «%s»", "Нове за пошуком «%s»", "Nové ve hledání „%s“", "New in “%s”"),
	"notif_drop_title": tx("Цена снижена", "Ціну знижено", "Cena snížena", "Price dropped"),
	"notif_drop_body":  tx("%s: %s → %s", "%s: %s → %s", "%s: %s → %s", "%s: %s → %s"),

	// chat
	"chat_own":      tx("Нельзя написать по своему объявлению", "Не можна написати щодо свого оголошення", "Nelze psát k vlastnímu inzerátu", "You can't message about your own listing"),
	"chat_text":     tx("Сообщение от 1 до 2000 символов", "Повідомлення від 1 до 2000 символів", "Zpráva musí mít 1–2000 znaků", "Message must be 1–2000 characters"),
	"chat_rate":     tx("Слишком много новых диалогов, попробуйте позже", "Забагато нових діалогів, спробуйте пізніше", "Příliš mnoho nových konverzací, zkuste to později", "Too many new conversations, try again later"),
	"chat_msg_rate": tx("Слишком часто, подождите минуту", "Занадто часто, зачекайте хвилину", "Příliš často, počkejte minutu", "Too fast, please wait a minute"),
}

var currencySigns = map[string]string{"CZK": "Kč", "EUR": "€", "USD": "$"}

// Price formats 12500000 CZK as "12 500 000 Kč" (non-breaking spaces).
func Price(v int64, currency string) string {
	s := fmt.Sprint(v)
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	var b strings.Builder
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteRune(' ')
		}
		b.WriteRune(r)
	}
	out := b.String()
	if neg {
		out = "-" + out
	}
	sign := currencySigns[currency]
	if sign == "" {
		sign = currency
	}
	return out + " " + sign
}
