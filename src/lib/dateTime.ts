const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

export const formatClockTime24 = (timestamp: number) => timeFormatter.format(new Date(timestamp));

export const formatTimeRange24 = (start: number, end: number) => `${formatClockTime24(start)} - ${formatClockTime24(end)}`;