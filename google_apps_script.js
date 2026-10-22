/**
 * INU 벽돌깨기 게임 기록 관리 Google Apps Script
 * 시트 ID: 1Y8KzzcuGjlDv2DUoyW7wLR3PfYmwlyg6MCgrz2mcXFE
 * 컬럼 구성: timestamp | name | finishtime
 */

const SPREADSHEET_ID = "1Y8KzzcuGjlDv2DUoyW7wLR3PfYmwlyg6MCgrz2mcXFE";
const SHEET_NAME = "시트1"; // 시트 탭 이름이 다르면 해당 이름으로 변경하세요.

function getTargetSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  
  // 첫 행 헤더가 없으면 초기화
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["timestamp", "name", "finishtime"]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#e0edfe");
  }
  return sheet;
}

/**
 * 1. GET 요청 처리 (Read - 전체 조회 및 Top 3 랭킹)
 * 요청 예시:
 *  - 전체 조회: ?action=read
 *  - Top 3 조회: ?action=top3
 */
function doGet(e) {
  try {
    const sheet = getTargetSheet();
    const action = e.parameter.action || "top3";
    const data = sheet.getDataRange().getValues();
    
    // 헤더 행 제외
    const rows = data.slice(1);
    
    // 객체 배열로 변환
    const records = rows.map((row, index) => {
      let ft = row[2];
      if (ft instanceof Date) {
        ft = Utilities.formatDate(ft, "Asia/Seoul", "mm:ss");
      } else {
        ft = String(ft || "").trim();
      }
      return {
        rowId: index + 2, // 실제 시트 행 번호
        timestamp: row[0] ? Utilities.formatDate(new Date(row[0]), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : "",
        name: row[1] || "",
        finishtime: ft || ""
      };
    }).filter(item => item.name && item.finishtime);

    let result = records;

    // Top 3 빠른 기록 정렬 (finishtime 기준 오름차순)
    if (action === "top3") {
      result = records.sort((a, b) => {
        return timeStringToSeconds(a.finishtime) - timeStringToSeconds(b.finishtime);
      }).slice(0, 3);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 2. POST 요청 처리 (Create, Update, Delete)
 */
function doPost(e) {
  try {
    const sheet = getTargetSheet();
    let params;
    
    if (e.postData && e.postData.contents) {
      try {
        params = JSON.parse(e.postData.contents);
      } catch (err) {
        params = e.parameter;
      }
    } else {
      params = e.parameter;
    }

    const action = params.action || "create";

    // [CREATE] 새 게임 완료 기록 추가
    if (action === "create") {
      const name = params.name || "익명";
      const finishtime = params.finishtime || "00:00";
      const timestamp = new Date();

      sheet.appendRow([timestamp, name, finishtime]);

      return ContentService
        .createTextOutput(JSON.stringify({
          status: "success",
          message: "기록이 성공적으로 등록되었습니다.",
          data: { timestamp, name, finishtime }
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // [UPDATE] 특정 사용자 기록 수정 (name 기준 또는 rowId 기준)
    if (action === "update") {
      const rowId = parseInt(params.rowId, 10);
      const newName = params.name;
      const newFinishTime = params.finishtime;

      if (!rowId || rowId <= 1 || rowId > sheet.getLastRow()) {
        throw new Error("유효하지 않은 rowId입니다.");
      }

      if (newName) sheet.getRange(rowId, 2).setValue(newName);
      if (newFinishTime) sheet.getRange(rowId, 3).setValue(newFinishTime);
      sheet.getRange(rowId, 1).setValue(new Date()); // timestamp 갱신

      return ContentService
        .createTextOutput(JSON.stringify({
          status: "success",
          message: `행 ${rowId} 기록이 수정되었습니다.`
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // [DELETE] 특정 행 삭제
    if (action === "delete") {
      const rowId = parseInt(params.rowId, 10);

      if (!rowId || rowId <= 1 || rowId > sheet.getLastRow()) {
        throw new Error("유효하지 않은 rowId입니다.");
      }

      sheet.deleteRow(rowId);

      return ContentService
        .createTextOutput(JSON.stringify({
          status: "success",
          message: `행 ${rowId} 기록이 삭제되었습니다.`
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    throw new Error("지원하지 않는 action입니다. (create, update, delete 중 선택)");
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 시간 문자열(MM:SS 또는 SS)을 초 단위 정수로 변환하는 보조 함수
function timeStringToSeconds(timeStr) {
  if (typeof timeStr === "number") return timeStr;
  if (!timeStr) return 999999;
  const parts = String(timeStr).trim().split(":");
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return parseInt(timeStr, 10) || 999999;
}
