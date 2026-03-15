function getWeekKey(date = /* @__PURE__ */ new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
function getPreviousWeekKey(weekKey) {
  const [year, weekStr] = weekKey.split("-W");
  let weekNum = parseInt(weekStr) - 1;
  let yearNum = parseInt(year);
  if (weekNum < 1) {
    yearNum--;
    weekNum = 52;
  }
  return `${yearNum}-W${String(weekNum).padStart(2, "0")}`;
}
function getWeekDates(weekKey) {
  const [year, weekStr] = weekKey.split("-W");
  const weekNum = parseInt(weekStr);
  const yearNum = parseInt(year);
  const jan4 = new Date(Date.UTC(yearNum, 0, 4));
  const startOfYear = new Date(jan4);
  startOfYear.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1));
  const monday = new Date(startOfYear);
  monday.setUTCDate(startOfYear.getUTCDate() + (weekNum - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d;
  });
}
export {
  getPreviousWeekKey as a,
  getWeekDates as b,
  getWeekKey as g
};
