
import typing
from pathlib import Path

class Scoring:
    def __init__(self, baseline_function_count=0, baseline_docstring_count=0):
        self.baseline_function_count = baseline_function_count
        self.baseline_docstring_count = baseline_docstring_count

    def score_code_quality(self, candidate_path: Path):
        try:
            src = candidate_path.read_text()
            score = 0
            reasons = []

            # Existing checks...
            if '@lru_cache' in src or '@cache' in src:
                score += 1
                reasons.append("added_caching")

            # Stronger delta signals
            current_function_count = src.count('def ')
            if current_function_count > self.baseline_function_count:
                score += 1
                reasons.append("new_functions")

            if '"""' in src or "'''" in src:
                current_docstrings = src.count('"""') + src.count("'''")
                if current_docstrings > self.baseline_docstring_count:
                    score += 1
                    reasons.append("improved_docs")

            return max(0, score), reasons
        except Exception:
            return 0, ["read_failed"]
