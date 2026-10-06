function doGet() {
  return HtmlService.createTemplateFromFile("90_Index")
    .evaluate()
    .setTitle("US Aussonne Basket");
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
