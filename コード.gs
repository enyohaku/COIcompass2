function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('COI Compass')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function selectCountry(countryName) {
  // ここでDifyとの連携や他の処理を実装します（次のステップで実装）
  return "Selected country: " + countryName;
}