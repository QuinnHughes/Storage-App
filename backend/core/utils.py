def parse_alt_call_number(call: str):
    parts = call.split("-")
    if len(parts) < 6:
        raise ValueError(f"Invalid alt call number: {call}")
    return {
        "floor": parts[1],
        "range": parts[2],
        "ladder": parts[3],
        "shelf": parts[4],
        "position": parts[5],
    }
