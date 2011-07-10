this.renderText = function renderText(text) {
	if (!text || text.length == 0) return "";
	var s = text[0];
	for (var i=1; i<text.length; i++) {
		if (['.',',','!','?'].indexOf(text[i]) < 0) s+=" ";
		s += text[i];
	}
	return s;
}


