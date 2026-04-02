package mailer

import (
	"context"
	"fmt"
	"log/slog"
	"net/smtp"

	"go-check-ssl/apps/api/internal/config"
)

type Message struct {
	To      string
	Subject string
	Body    string
}

type Sender interface {
	Send(ctx context.Context, message Message) error
}

type senderFunc func(ctx context.Context, message Message) error

func (fn senderFunc) Send(ctx context.Context, message Message) error {
	return fn(ctx, message)
}

func NewSender(cfg config.SMTPConfig, logger *slog.Logger) Sender {
	if cfg.Host == "" || cfg.From == "" {
		return senderFunc(func(ctx context.Context, message Message) error {
			logger.Info("email delivery skipped (SMTP not configured)", "to", message.To, "subject", message.Subject, "body", message.Body)
			return nil
		})
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)

	return senderFunc(func(ctx context.Context, message Message) error {
		body := []byte(fmt.Sprintf("To: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s", message.To, message.Subject, message.Body))
		return smtp.SendMail(addr, auth, cfg.From, []string{message.To}, body)
	})
}

type MemorySender struct {
	Messages []Message
}

func (m *MemorySender) Send(ctx context.Context, message Message) error {
	m.Messages = append(m.Messages, message)
	return nil
}
