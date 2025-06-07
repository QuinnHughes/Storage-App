def parse_alternative_call_number(call: str):
    parts = call.split("-")
    if len(parts) != 6:
        raise ValueError("Call number must be in the format 'S-1-01B-03-04-005'")
    return {
        "location": parts[0],
        "floor": parts[1],
        "range_code": parts[2],
        "ladder": parts[3],
        "shelf": parts[4],
        "position": parts[5],
    }
