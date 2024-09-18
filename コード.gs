// Code.gs

// スクリプトプロパティから設定を取得
const scriptProperties = PropertiesService.getScriptProperties();
const DIFY_API_BASE_URL = scriptProperties.getProperty('DIFY_API_BASE_URL');
const DIFY_AGENT_API_KEY = scriptProperties.getProperty('DIFY_AGENT_API_KEY');

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('COI Compass')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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

function processUserMessage(country, message, conversationId, userId) {
  var difyResponse = queryDify(message, conversationId, userId);
  var driveResults = searchGoogleDrive(message);
  return {
    userMessage: message,
    difyResponse: difyResponse,
    driveResults: driveResults
  };
}

function queryDify(userMessage, conversationId, userId) {
  if (!DIFY_API_BASE_URL || !DIFY_AGENT_API_KEY) {
    Logger.log('Dify API設定が見つかりません。スクリプトプロパティを確認してください。');
    return { error: 'Dify API設定が不足しています。' };
  }

  var options = {
    'method': 'post',
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DIFY_AGENT_API_KEY
    },
    'payload': JSON.stringify({
      'inputs': {},
      'query': userMessage,
      'response_mode': 'streaming',
      'user': userId,
      'conversation_id': conversationId
    }),
    'muteHttpExceptions': true
  };

  try {
    var response = UrlFetchApp.fetch(DIFY_API_BASE_URL + "/chat-messages", options);
    var result = "";
    var lines = response.getContentText().split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.startsWith("data: ")) {
        var data = JSON.parse(line.substring(6));
        if (data.event === "agent_message" || data.event === "message") {
          result += data.answer;
        } else if (data.event === "message_end") {
          Logger.log("conversation: " + data.conversation_id);
          return result;
        } else if (data.event === "error") {
          return result + data.event + String(data);
        }
      }
    }
    var json = JSON.parse(response);
    if (json.code === "not_found") {
      return json.message;
    }
  } catch (e) {
    Logger.log(e.toString());
    return { error: 'リクエストの処理中にエラーが発生しました。' };
  }
}

// クライアントサイドのHTMLに結果を返す関数
function handleUserInput(country, message, conversationId, userId) {
  return processUserMessage(country, message, conversationId, userId);
}

// テスト用関数
function testAgentConversation() {
  var message = queryDify("自己紹介して", "", "test_user");
  Logger.log(message);
}

// スクリプトプロパティを設定するための関数
function setDifyApiConfig(apiBaseUrl, apiKey) {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('DIFY_API_BASE_URL', apiBaseUrl);
  scriptProperties.setProperty('DIFY_AGENT_API_KEY', apiKey);
  Logger.log('Dify API設定が更新されました。');
}