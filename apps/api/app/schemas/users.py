from pydantic import BaseModel


class AccountDeletionResponse(BaseModel):
    status: str   # "deletion_scheduled"
    message: str
