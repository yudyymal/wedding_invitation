/**
 * ============================================================
 *  СВАДЕБНОЕ ПРИГЛАШЕНИЕ — бэкенд на Google Apps Script
 * ============================================================
 *  Как подключить — см. файл SETUP.md.
 *
 *  Таблица должна содержать 2 вкладки:
 *   1) groups — по одной строке на группу гостей (=персональная ссылка)
 *   2) people — по одной строке на каждого гостя внутри группы
 *
 *  Точные названия и порядок столбцов см. в константах ниже
 *  и в SETUP.md. Названия столбцов в самой шапке таблицы
 *  должны совпадать буква в букву.
 * ============================================================
 */

var SHEET_GROUPS = 'groups';
var SHEET_PEOPLE = 'people';

/* ---------------------- GET: отдать данные гостя ---------------------- */
function doGet(e) {
  var guestId = e && e.parameter ? e.parameter.guest : null;
  var result = { found: false };

  if (guestId) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var groupsSheet = ss.getSheetByName(SHEET_GROUPS);
    var groupsValues = groupsSheet.getDataRange().getValues();
    var gHeaders = groupsValues[0];
    var gidCol = gHeaders.indexOf('group_id');

    for (var i = 1; i < groupsValues.length; i++) {
      if (String(groupsValues[i][gidCol]).trim() === String(guestId).trim()) {
        result.found = true;
        gHeaders.forEach(function (h, idx) {
          result[h] = formatValue_(groupsValues[i][idx]);
        });
        break;
      }
    }

    if (result.found) {
      var peopleSheet = ss.getSheetByName(SHEET_PEOPLE);
      var peopleValues = peopleSheet.getDataRange().getValues();
      var pHeaders = peopleValues[0];
      var pGidCol = pHeaders.indexOf('group_id');
      var people = [];
      for (var j = 1; j < peopleValues.length; j++) {
        if (String(peopleValues[j][pGidCol]).trim() === String(guestId).trim()) {
          var person = {};
          pHeaders.forEach(function (h, idx) {
            person[h] = formatValue_(peopleValues[j][idx]);
          });
          people.push(person);
        }
      }
      result.people = people;
    }
  }

  return jsonOutput_(result);
}

/* ---------------------- POST: сохранить ответы анкеты ---------------------- */
function doPost(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_({ status: 'error', message: 'Некорректный JSON' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var now = new Date();

  // ---- 1. Обновляем строку группы ----
  if (payload.group_id) {
    var groupsSheet = ss.getSheetByName(SHEET_GROUPS);
    var groupsValues = groupsSheet.getDataRange().getValues();
    var gHeaders = groupsValues[0];
    var gidCol = gHeaders.indexOf('group_id');
    var wcgCol = gHeaders.indexOf('will_come_group');
    var declineCol = gHeaders.indexOf('decline_reason');
    var creationCol = gHeaders.indexOf('creation_date');
    var lastUpdateCol = gHeaders.indexOf('last_update_date');

    for (var i = 1; i < groupsValues.length; i++) {
      if (String(groupsValues[i][gidCol]).trim() === String(payload.group_id).trim()) {
        var rowNum = i + 1;
        if (wcgCol > -1) groupsSheet.getRange(rowNum, wcgCol + 1).setValue(payload.will_come_group);
        if (declineCol > -1) groupsSheet.getRange(rowNum, declineCol + 1).setValue(payload.decline_reason || '');
        if (creationCol > -1 && !groupsValues[i][creationCol]) {
          groupsSheet.getRange(rowNum, creationCol + 1).setValue(now);
        }
        if (lastUpdateCol > -1) groupsSheet.getRange(rowNum, lastUpdateCol + 1).setValue(now);
        break;
      }
    }
  }

  // ---- 2. Обновляем/добавляем строки людей ----
  if (payload.people && payload.people.length) {
    var peopleSheet = ss.getSheetByName(SHEET_PEOPLE);
    var peopleValues = peopleSheet.getDataRange().getValues();
    var pHeaders = peopleValues[0];
    var pidCol = pHeaders.indexOf('personal_id');

    payload.people.forEach(function (person) {
      var rowIndex = -1;
      for (var k = 1; k < peopleValues.length; k++) {
        if (String(peopleValues[k][pidCol]).trim() === String(person.personal_id).trim()) {
          rowIndex = k;
          break;
        }
      }
      if (rowIndex > -1) {
        var rowNum = rowIndex + 1;
        pHeaders.forEach(function (h, idx) {
          if (person[h] !== undefined && h !== 'group_id') {
            peopleSheet.getRange(rowNum, idx + 1).setValue(person[h]);
          }
        });
      } else {
        var newRow = pHeaders.map(function (h) {
          if (h === 'group_id') return payload.group_id || '';
          return person[h] !== undefined ? person[h] : '';
        });
        peopleSheet.appendRow(newRow);
        peopleValues.push(newRow);
      }
    });
  }

  return jsonOutput_({ status: 'ok' });
}

/* ---------------------- служебные функции ---------------------- */
function formatValue_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }
  return v;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
