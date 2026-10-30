// Package jwtx issues and verifies HS256 access tokens.
package jwtx

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const issuer = "kup-auth"

func Sign(secret []byte, userID string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := jwt.RegisteredClaims{
		Subject:   userID,
		Issuer:    issuer,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

// Verify returns the user ID from a valid token.
func Verify(secret []byte, token string) (string, error) {
	var claims jwt.RegisteredClaims
	_, err := jwt.ParseWithClaims(token, &claims, func(*jwt.Token) (any, error) { return secret, nil },
		jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer(issuer), jwt.WithExpirationRequired())
	if err != nil {
		return "", err
	}
	if claims.Subject == "" {
		return "", errors.New("empty subject")
	}
	return claims.Subject, nil
}
