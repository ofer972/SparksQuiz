"""
Seed data: inserted once at startup if not already present.
Safe to run on every startup — checks for existence before inserting.
"""
import logging
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

SEED_QUIZZES = [
    {
        "title": "History, Science & World Wonders",
        "description": (
            "Test your knowledge with five fascinating questions spanning "
            "ancient history, space exploration, and the modern world."
        ),
        "questions": [
            {
                "question_text": (
                    "The Great Wall of China was constructed over many centuries by multiple dynasties "
                    "to defend against northern invasions. When adding up all sections ever built, "
                    "including branches and all fortifications, what is the approximate total combined "
                    "length of all Great Wall structures?"
                ),
                "question_type": "single",
                "time_limit": 25,
                "order_index": 1,
                "answers": [
                    {
                        "answer_text": (
                            "Approximately 13,170 miles (21,196 km), making it one of the longest "
                            "man-made structures ever built in all of human history"
                        ),
                        "is_correct": True,
                    },
                    {
                        "answer_text": (
                            "Approximately 5,000 miles (8,047 km), running only along China's "
                            "northern border region with Mongolia and Manchuria"
                        ),
                        "is_correct": False,
                    },
                    {
                        "answer_text": (
                            "Approximately 8,850 miles (14,245 km), roughly equal to the "
                            "straight-line distance from New York City to Tokyo, Japan"
                        ),
                        "is_correct": False,
                    },
                    {
                        "answer_text": (
                            "Approximately 21,000 miles (33,796 km), long enough to wrap "
                            "almost entirely around the Earth's equator once"
                        ),
                        "is_correct": False,
                    },
                ],
            },
            {
                "question_text": (
                    "Ancient Greek and Roman scholars compiled lists of remarkable constructions "
                    "known as the Seven Wonders of the Ancient World. Which of the following "
                    "structures were genuinely included on that classic list? Select all correct answers."
                ),
                "question_type": "multi",
                "time_limit": 30,
                "order_index": 2,
                "answers": [
                    {
                        "answer_text": (
                            "The Great Pyramid of Giza in Egypt, the only Wonder still standing "
                            "today, built around 2560 BC as a royal tomb for Pharaoh Khufu"
                        ),
                        "is_correct": True,
                    },
                    {
                        "answer_text": (
                            "The Colosseum in Rome, Italy, an enormous amphitheater completed "
                            "in 80 AD and capable of seating over 50,000 spectators"
                        ),
                        "is_correct": False,
                    },
                    {
                        "answer_text": (
                            "The Hanging Gardens of Babylon, a legendary terraced garden allegedly "
                            "built in modern-day Iraq around 600 BC by King Nebuchadnezzar II"
                        ),
                        "is_correct": True,
                    },
                    {
                        "answer_text": (
                            "The Lighthouse of Alexandria in Egypt, a tower standing over 100 meters "
                            "tall on the island of Pharos that guided sailors for centuries"
                        ),
                        "is_correct": True,
                    },
                ],
            },
            {
                "question_text": (
                    "On July 20, 1969, NASA's Apollo 11 mission successfully landed on the Moon for "
                    "the very first time in history. Neil Armstrong and Buzz Aldrin descended to the "
                    "surface while Michael Collins orbited above. How long did Armstrong and Aldrin "
                    "actually spend outside walking on the lunar surface during their single moonwalk?"
                ),
                "question_type": "single",
                "time_limit": 20,
                "order_index": 3,
                "answers": [
                    {
                        "answer_text": (
                            "Approximately 2 hours and 31 minutes, enough time to plant the flag, "
                            "collect rock samples, and speak live with President Nixon"
                        ),
                        "is_correct": True,
                    },
                    {
                        "answer_text": (
                            "Approximately 6 hours and 15 minutes, nearly a full work shift in which "
                            "they conducted experiments across a wide area of the surface"
                        ),
                        "is_correct": False,
                    },
                    {
                        "answer_text": (
                            "Approximately 12 hours and 45 minutes, covering almost half of the "
                            "entire mission's total time spent on the lunar surface"
                        ),
                        "is_correct": False,
                    },
                    {
                        "answer_text": (
                            "Approximately 30 minutes exactly, an extremely brief walkabout due "
                            "to serious concerns about the integrity of their spacesuits"
                        ),
                        "is_correct": False,
                    },
                ],
            },
            {
                "question_text": (
                    "The modern internet was not invented by a single person but evolved through "
                    "decades of collaborative research. Which of the following were genuinely critical "
                    "and historically documented milestones in the development of the internet as we "
                    "know it today? Select all correct answers."
                ),
                "question_type": "multi",
                "time_limit": 30,
                "order_index": 4,
                "answers": [
                    {
                        "answer_text": (
                            "The creation of ARPANET in 1969 by the US Department of Defense, "
                            "the first packet-switching network and direct ancestor of the modern internet"
                        ),
                        "is_correct": True,
                    },
                    {
                        "answer_text": (
                            "Tim Berners-Lee inventing the World Wide Web and the HTTP protocol in "
                            "1989 at CERN, making the internet accessible and navigable for ordinary people"
                        ),
                        "is_correct": True,
                    },
                    {
                        "answer_text": (
                            "Bill Gates personally designing the TCP/IP protocol suite in 1974 while "
                            "working at Microsoft, which he founded from his college dormitory room"
                        ),
                        "is_correct": False,
                    },
                    {
                        "answer_text": (
                            "The launch of the Domain Name System (DNS) in 1983, replacing "
                            "hard-to-memorize numeric IP addresses with human-readable domain names like google.com"
                        ),
                        "is_correct": True,
                    },
                ],
            },
            {
                "question_text": (
                    "The Eiffel Tower was built between 1887 and 1889 as the entrance arch for the "
                    "World's Fair in Paris and was officially scheduled to be dismantled and sold for "
                    "scrap after just 20 years. What was the primary reason it was ultimately spared "
                    "from demolition and allowed to remain standing permanently?"
                ),
                "question_type": "single",
                "time_limit": 15,
                "order_index": 5,
                "answers": [
                    {
                        "answer_text": (
                            "Structural engineers declared it impossible to demolish safely without "
                            "causing catastrophic and irreparable damage to the surrounding Champ de Mars park"
                        ),
                        "is_correct": False,
                    },
                    {
                        "answer_text": (
                            "It was repurposed as a long-range radio transmission tower, giving it "
                            "ongoing strategic and scientific value that justified its permanent preservation"
                        ),
                        "is_correct": True,
                    },
                    {
                        "answer_text": (
                            "A massive public petition signed by over two million French citizens "
                            "successfully pressured the government into reversing its original demolition plans"
                        ),
                        "is_correct": False,
                    },
                    {
                        "answer_text": (
                            "The French government simply ran out of the funds needed to pay demolition "
                            "contractors after heavy wartime spending during the First World War"
                        ),
                        "is_correct": False,
                    },
                ],
            },
        ],
    },
]


def seed_default_data(engine: Engine) -> None:
    """Insert seed quizzes if they don't already exist (matched by title)."""
    with engine.begin() as conn:
        for quiz in SEED_QUIZZES:
            existing = conn.execute(
                text("SELECT id FROM quizzes WHERE title = :title"),
                {"title": quiz["title"]},
            ).fetchone()

            if existing:
                logger.info(f"Seed quiz already exists, skipping: '{quiz['title']}'")
                continue

            # Insert quiz
            quiz_row = conn.execute(
                text(
                    "INSERT INTO quizzes (title, description) "
                    "VALUES (:title, :description) RETURNING id"
                ),
                {"title": quiz["title"], "description": quiz["description"]},
            ).fetchone()
            quiz_id = quiz_row.id

            # Insert questions + answers
            for q in quiz["questions"]:
                q_row = conn.execute(
                    text(
                        "INSERT INTO questions "
                        "(quiz_id, question_text, question_type, time_limit, order_index) "
                        "VALUES (:quiz_id, :qt, :qtype, :tl, :oi) RETURNING id"
                    ),
                    {
                        "quiz_id": quiz_id,
                        "qt": q["question_text"],
                        "qtype": q["question_type"],
                        "tl": q["time_limit"],
                        "oi": q["order_index"],
                    },
                ).fetchone()
                q_id = q_row.id

                for a in q["answers"]:
                    conn.execute(
                        text(
                            "INSERT INTO answers (question_id, answer_text, is_correct) "
                            "VALUES (:qid, :at, :ic)"
                        ),
                        {"qid": q_id, "at": a["answer_text"], "ic": a["is_correct"]},
                    )

            logger.info(
                f"Seeded quiz '{quiz['title']}' with {len(quiz['questions'])} questions"
            )
