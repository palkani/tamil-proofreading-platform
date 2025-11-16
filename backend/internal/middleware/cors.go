package middleware

import (
        "strings"

        "github.com/gin-gonic/gin"
)

func CORS(allowedOrigin string) gin.HandlerFunc {
        return func(c *gin.Context) {
                origin := c.Request.Header.Get("Origin")
                
                if origin != "" && (strings.HasPrefix(origin, "http://localhost:") || 
                    strings.HasPrefix(origin, "http://127.0.0.1:") ||
                    origin == allowedOrigin) {
                        c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
                } else {
                        c.Writer.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
                }
                
                c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
                c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
                c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

                if c.Request.Method == "OPTIONS" {
                        c.AbortWithStatus(204)
                        return
                }

                c.Next()
        }
}

