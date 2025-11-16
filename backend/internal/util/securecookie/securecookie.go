package securecookie

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
)

const (
	minKeyLength = 16
	aesKeyLength = 32
	nonceSize    = 12
)

func normalizeKey(key []byte) ([]byte, error) {
	if len(key) == 0 {
		return nil, errors.New("encryption key is empty")
	}

	switch {
	case len(key) >= aesKeyLength:
		return key[:aesKeyLength], nil
	case len(key) >= minKeyLength:
		padded := make([]byte, aesKeyLength)
		copy(padded, key)
		return padded, nil
	default:
		return nil, errors.New("encryption key length insufficient")
	}
}

// Encrypt encrypts plaintext with AES-GCM and returns a base64 string.
func Encrypt(plaintext, key []byte) (string, error) {
	if len(plaintext) == 0 {
		return "", errors.New("plaintext is empty")
	}

	normKey, err := normalizeKey(key)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(normKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, nonceSize)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return base64.RawURLEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts a base64 encoded AES-GCM payload.
func Decrypt(encoded string, key []byte) ([]byte, error) {
	if encoded == "" {
		return nil, errors.New("encoded payload is empty")
	}

	normKey, err := normalizeKey(key)
	if err != nil {
		return nil, err
	}

	data, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	if len(data) < nonceSize {
		return nil, errors.New("ciphertext too short")
	}

	block, err := aes.NewCipher(normKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}

	return plaintext, nil
}
