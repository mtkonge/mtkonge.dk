import "./style.css"

const input = document.querySelector<HTMLInputElement>("#terminal-input")!;
const cursor = document.querySelector<HTMLSpanElement>("#cursor")!;

hideCursor()
updateCursorPosition()
setInputMaxLength()

input.addEventListener("input", updateCursorPosition);
input.addEventListener("keydown", updateCursorPosition);
input.addEventListener("keyup", updateCursorPosition);
input.addEventListener("click", updateCursorPosition);
input.addEventListener("focus", showCursor);
input.addEventListener("blur", hideCursor);
window.addEventListener("resize", setInputMaxLength);

function setInputMaxLength() {
  const width = input.clientWidth
  const charWidth = 10
  input.maxLength = Math.floor(width / charWidth) - 1
}

function updateCursorPosition() {
  // a lot of this is hardcoded. Figure out a way to fix this
  const marginPx = 8
  const offsetPx = 2
  const prefixChars = "guest@mtkonge:~$ ".length
  const charWidth = 10;

  const cursorPosition = input.selectionStart!;
  const cursorLeft = (prefixChars + cursorPosition) * charWidth + marginPx + offsetPx

  cursor.style.left = cursorLeft + "px";

}

function showCursor() {
    cursor.style.display = "inline-block";
}

function hideCursor() {
    cursor.style.display = "none";
}
