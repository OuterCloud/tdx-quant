from datetime import date

import exchange_calendars as xcals

_cal = xcals.get_calendar("XSHG")


def is_trading_day(d: date | None = None) -> bool:
    d = d or date.today()
    return _cal.is_session(d.isoformat())


def last_trading_day(d: date | None = None) -> date:
    d = d or date.today()
    ts = _cal.previous_close(d.isoformat())
    return ts.date()


def trading_days_between(start: date, end: date) -> list[date]:
    sessions = _cal.sessions_in_range(start.isoformat(), end.isoformat())
    return [s.date() for s in sessions]
