def calculate_score(is_correct: bool, time_remaining: float, total_time: float) -> int:
    """
    800 base points + up to 200 speed bonus for correct answers.
    Partial selection counts as wrong (0 points).
    """
    if not is_correct:
        return 0
    speed_bonus = int(200 * (time_remaining / total_time)) if total_time > 0 else 0
    return 800 + speed_bonus
