import { purposeLabel, statusLabel, visitTypeLabel } from "./labels";
import type { Visit } from "./types";
import { formatDateTime } from "./utils";

function cell(value: string | number | undefined): string {
  const safe = value === undefined || value === "" ? "—" : String(value);
  return safe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildVisitLogExcelHtml(visits: Visit[]): string {
  const rows = visits
    .map(
      (visit) => `
        <tr>
          <td>${cell(visit.plate)}</td>
          <td>${cell(visit.visitorName)}</td>
          <td>${cell(visit.visitorContact)}</td>
          <td>${cell(visitTypeLabel(visit.visitType))}</td>
          <td>${cell(purposeLabel(visit.purpose))}</td>
          <td>${cell(visit.hostDepartment)}</td>
          <td>${cell(formatDateTime(visit.entryTime))}</td>
          <td>${cell(visit.exitTime ? formatDateTime(visit.exitTime) : undefined)}</td>
          <td>${cell(statusLabel(visit.status))}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      table { border-collapse: collapse; font-family: Arial, sans-serif; }
      th { background: #C8102E; color: #ffffff; font-weight: 700; }
      th, td { border: 1px solid #d9d9d9; padding: 8px 10px; white-space: nowrap; }
    </style>
  </head>
  <body>
    <table>
      <thead>
        <tr>
          <th>Plate</th>
          <th>Visitor</th>
          <th>Contact</th>
          <th>Visit Type</th>
          <th>Purpose</th>
          <th>Host Department</th>
          <th>Entry Time</th>
          <th>Exit Time</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;
}

export function downloadVisitLogExcel(visits: Visit[], filename: string) {
  const html = buildVisitLogExcelHtml(visits);
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
