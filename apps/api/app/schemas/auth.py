from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Literal
import re


# --- Request ---

class EmailSignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

    @model_validator(mode='after')
    def validate_password_strength(self) -> "EmailSignupRequest":
        pwd = self.password
        if not re.search(r'[A-Za-z]', pwd) or not re.search(r'\d', pwd):
            raise ValueError("비밀번호는 문자와 숫자를 모두 포함해야 해요")
        return self


class EmailLoginRequest(BaseModel):
    email: EmailStr
    password: str


class SocialAuthRequest(BaseModel):
    provider: Literal['apple', 'google']
    id_token: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


# --- Response ---

class AuthTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    entitlement: Literal['free', 'trial', 'premium']
    user_id: str


class UserResponse(BaseModel):
    id: str
    email: str | None
    provider: str
    entitlement: Literal['free', 'trial', 'premium']
