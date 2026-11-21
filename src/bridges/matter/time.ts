export const timeZones = ["Europe/Prague", "Europe/London", "UTC"] as const;
export type TimeZone = typeof timeZones[number];

export function isTimeZone(value: string): value is TimeZone {
    return timeZones.some((zone) => zone === value);
}

const matterEpoch = Date.UTC(2000, 0, 1);
const day = 24 * 60 * 60 * 1000;

export function matterTime(time: number): number {
    return (time - matterEpoch) * 1000;
}

function offsetAt(zone: TimeZone, time: number): number {
    const parts = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(time);
    const name = parts.find((part) => part.type === "timeZoneName")?.value;
    if (name === "GMT") return 0;
    const match = /^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(name || "");
    if (!match) throw new Error(`Cannot determine time-zone offset for ${zone}`);
    return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] || 0));
}

function nextTransition(zone: TimeZone, start: number): number | undefined {
    const current = offsetAt(zone, start);
    for (let end = start + day; end <= start + 400 * day; end += day) {
        if (offsetAt(zone, end) === current) continue;
        let low = Math.floor((end - day) / 1000);
        let high = Math.floor(end / 1000);
        while (high - low > 1) {
            const middle = Math.floor((low + high) / 2);
            if (offsetAt(zone, middle * 1000) === current) low = middle;
            else high = middle;
        }
        return high * 1000;
    }
}

export function timeZoneSchedule(zone: TimeZone, now: number, capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Invalid Matter DST list capacity");
    const year = new Date(now).getUTCFullYear();
    const standardOffset = offsetAt(zone, Date.UTC(year, 0, 15, 12));
    const transition = nextTransition(zone, now);
    const dstOffset: { offset: number; validStarting: number; validUntil: number | null }[] = [{
        offset: offsetAt(zone, now) - standardOffset,
        validStarting: 0,
        validUntil: transition === undefined ? null : matterTime(transition),
    }];
    if (transition !== undefined && capacity > 1) {
        const next = nextTransition(zone, transition);
        dstOffset.push({
            offset: offsetAt(zone, transition) - standardOffset,
            validStarting: matterTime(transition),
            validUntil: next === undefined ? null : matterTime(next),
        });
    }
    let refreshAt = now + day;
    if (transition !== undefined && transition + 1000 < refreshAt) refreshAt = transition + 1000;
    return { standardOffset, dstOffset, refreshAt };
}
