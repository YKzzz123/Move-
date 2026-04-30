from __future__ import annotations

from datetime import date

def zodiac_sign_from_birthday(birthday: date) -> str:
    """
    Compute Western zodiac sign from Gregorian birthday.
    Intervals (month, day) inclusive where applicable:
    Capricorn Dec 22 – Jan 19, Aquarius Jan 20 – Feb 18, Pisces Feb 19 – Mar 20,
    Aries Mar 21 – Apr 19, Taurus Apr 20 – May 20, Gemini May 21 – Jun 20,
    Cancer Jun 21 – Jul 22, Leo Jul 23 – Aug 22, Virgo Aug 23 – Sep 22,
    Libra Sep 23 – Oct 22, Scorpio Oct 23 – Nov 21, Sagittarius Nov 22 – Dec 21.
    """
    m, d = birthday.month, birthday.day
    day_index = m * 100 + d
    if day_index >= 1222 or day_index <= 119:
        return "Capricorn"
    if day_index <= 218:
        return "Aquarius"
    if day_index <= 320:
        return "Pisces"
    if day_index <= 419:
        return "Aries"
    if day_index <= 520:
        return "Taurus"
    if day_index <= 620:
        return "Gemini"
    if day_index <= 722:
        return "Cancer"
    if day_index <= 822:
        return "Leo"
    if day_index <= 922:
        return "Virgo"
    if day_index <= 1022:
        return "Libra"
    if day_index <= 1121:
        return "Scorpio"
    if day_index <= 1221:
        return "Sagittarius"
    return "Capricorn"


__all__ = ["zodiac_sign_from_birthday"]
