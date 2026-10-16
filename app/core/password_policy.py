MIN_LENGTH = 10

# Lowercased; checked by equality so a longer variant of these is still allowed.
_COMMON_PASSWORDS = {
    "1234567890",
    "12345678910",
    "qwertyuiop",
    "password123",
    "password1234",
    "admin12345",
    "senha12345",
    "mudar12345",
    "changeme123",
}


def password_problems(password: str, *, email: str | None = None) -> list[str]:
    """Return what is wrong with a password; an empty list means it is acceptable."""
    problems: list[str] = []
    if len(password) < MIN_LENGTH:
        problems.append(f"at least {MIN_LENGTH} characters")
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        problems.append("at least one letter and one digit")
    if password.lower() in _COMMON_PASSWORDS:
        problems.append("not a commonly used password")
    local_part = (email or "").split("@")[0].lower()
    if len(local_part) >= 4 and local_part in password.lower():
        problems.append("must not contain the e-mail name")
    return problems


def describe(problems: list[str]) -> str:
    return "password needs: " + "; ".join(problems)
