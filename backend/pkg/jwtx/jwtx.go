// Package jwtx issues and verifies HS256 access tokens.
package jwtx

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const issuer = "kup-auth"

type claims struct {
	jwt.RegisteredClaims
	Role string `json:"role,omitempty"`
}

func Sign(secret []byte, userID, role string, ttl time.Duration) (string, error) {
	now := time.Now()
	c := claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
		Role: role,
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(secret)
}

// Verify returns the user ID and role from a valid token.
func Verify(secret []byte, token string) (userID, role string, err error) {
	var c claims
	_, err = jwt.ParseWithClaims(token, &c, func(*jwt.Token) (any, error) { return secret, nil },
		jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer(issuer), jwt.WithExpirationRequired())
	if err != nil {
		return "", "", err
	}
	if c.Subject == "" {
		return "", "", errors.New("empty subject")
	}
	if c.Role == "" {
		c.Role = "user"
	}
	return c.Subject, c.Role, nil
}
