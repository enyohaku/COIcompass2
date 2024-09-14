// Code.gs

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('COI Compass')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function selectCountry(countryName) {
  // この関数は現在使用されていないようです。必要に応じて実装や削除を検討してください。
  return "Selected country: " + countryName;
}

function searchGoogleDrive(query) {
  var files = DriveApp.searchFiles('fullText contains "' + query + '"');
  var results = [];
  while (files.hasNext()) {
    var file = files.next();
    results.push({
      name: file.getName(),
      id: file.getId(),
      url: file.getUrl(),
      snippet: getFileSnippet(file, query)
    });
  }
  return results;
}

function getFileSnippet(file, query) {
  var content = "";
  if (file.getMimeType() === MimeType.GOOGLE_DOCS) {
    var doc = DocumentApp.openById(file.getId());
    content = doc.getBody().getText();
  } else if (file.getMimeType() === MimeType.PDF) {
    return "PDFファイルです。内容の詳細はファイルを開いてご確認ください。";
  }
  
  var index = content.toLowerCase().indexOf(query.toLowerCase());
  if (index !== -1) {
    var start = Math.max(0, index - 50);
    var end = Math.min(content.length, index + query.length + 50);
    return "..." + content.substring(start, end) + "...";
  }
  return "該当箇所が見つかりませんでした。";
}

function processUserMessage(country, message) {
  var difyResponse = queryDify(country, message);
  var driveResults = searchGoogleDrive(message);
  return {
    userMessage: message,
    difyResponse: difyResponse,
    driveResults: driveResults
  };
}

function queryDify(country, message) {
  // TODO: 実際のDify APIの呼び出しをここに実装してください
  return "This is a placeholder response from Dify for the country: " + country + " and message: " + message;
}

// クライアントサイドのHTMLに結果を返す関数
function handleUserInput(country, message) {
  return processUserMessage(country, message);
}