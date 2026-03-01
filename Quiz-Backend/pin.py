import random
import string


def generate_pin() -> str:
    return "".join(random.choices(string.digits, k=5))
