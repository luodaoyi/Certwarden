package httpapi

import (
	"net/http"

	"github.com/luodaoyi/Certwarden/apps/api/internal/auth"
)

type registerRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	TenantName string `json:"tenant_name"`
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type verifyEmailRequest struct {
	Token string `json:"token"`
}

type forgotPasswordRequest struct {
	Account string `json:"account"`
}

type resetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

type updateProfileRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var input registerRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := s.auth.Register(r.Context(), auth.RegisterInput{
		Username:   input.Username,
		Password:   input.Password,
		TenantName: input.TenantName,
	})
	if err != nil {
		status, message := authStatus(err)
		writeError(w, status, message)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"message": "registration successful, you can sign in now",
		"user":    toAPIUser(*user),
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var input loginRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, tokens, err := s.auth.Login(r.Context(), auth.LoginInput{
		Username:  input.Username,
		Password:  input.Password,
		UserAgent: r.UserAgent(),
		IPAddress: r.RemoteAddr,
	})
	if err != nil {
		status, message := authStatus(err)
		writeError(w, status, message)
		return
	}

	s.setRefreshCookie(w, tokens.RefreshToken, tokens.RefreshExpiresAt)
	writeJSON(w, http.StatusOK, map[string]any{
		"user":   toAPIUser(*user),
		"tokens": tokens,
	})
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(refreshCookieName)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "missing refresh cookie")
		return
	}

	user, tokens, err := s.auth.Refresh(r.Context(), cookie.Value, r.UserAgent(), r.RemoteAddr)
	if err != nil {
		status, message := authStatus(err)
		writeError(w, status, message)
		return
	}

	s.setRefreshCookie(w, tokens.RefreshToken, tokens.RefreshExpiresAt)
	writeJSON(w, http.StatusOK, map[string]any{
		"user":   toAPIUser(*user),
		"tokens": tokens,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(refreshCookieName)
	if err == nil {
		_ = s.auth.Logout(r.Context(), cookie.Value)
	}
	s.clearRefreshCookie(w)
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

func (s *Server) handleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var input verifyEmailRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.auth.VerifyEmail(r.Context(), input.Token); err != nil {
		status, message := authStatus(err)
		writeError(w, status, message)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "verified"})
}

func (s *Server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var input forgotPasswordRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.auth.ForgotPassword(r.Context(), input.Account); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "reset_link_sent"})
}

func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var input resetPasswordRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.auth.ResetPassword(r.Context(), auth.ResetPasswordInput{
		Token:       input.Token,
		NewPassword: input.NewPassword,
	}); err != nil {
		status, message := authStatus(err)
		writeError(w, status, message)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "password_reset"})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	userInfo, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "missing authenticated user")
		return
	}
	user, err := s.auth.GetUserByID(r.Context(), userInfo.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": toAPIUser(*user)})
}

func (s *Server) handleUpdateMe(w http.ResponseWriter, r *http.Request) {
	userInfo, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "missing authenticated user")
		return
	}

	var input updateProfileRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := s.auth.UpdateProfile(r.Context(), userInfo.ID, auth.UpdateProfileInput{
		Username: input.Username,
		Email:    input.Email,
	})
	if err != nil {
		status, message := authStatus(err)
		writeError(w, status, message)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"user": toAPIUser(*user)})
}
