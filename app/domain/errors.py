class DomainError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class NotFoundError(DomainError):
    pass


class ValidationError(DomainError):
    pass


class ConflictError(DomainError):
    pass
