import "./style.css"

const input = document.querySelector<HTMLInputElement>("#terminal-input")!;
const cursor = document.querySelector<HTMLSpanElement>("#cursor")!;

hideCursor()
updateCursorPosition()
input.addEventListener("input", updateCursorPosition);
input.addEventListener("keydown", updateCursorPosition);
input.addEventListener("keyup", updateCursorPosition);
input.addEventListener("click", updateCursorPosition);
input.addEventListener("focus", showCursor);
input.addEventListener("blur", hideCursor);

function updateCursorPosition() {
  // a lot of this is hardcoded. Figure out a way to fix this
  const marginPx = 8
  const offsetPx = 2
  const prefixChars = "guest@mtkonge:~$ ".length
  const charWidth = 10;

  const cursorPosition = input.selectionStart!;
  const cursorLeft = (prefixChars + cursorPosition) * charWidth + marginPx + offsetPx
  console.log(cursorPosition)
  console.log(cursorLeft)

  cursor.style.left = cursorLeft + "px";

}

function showCursor() {
    cursor.style.display = "inline-block";
}

function hideCursor() {
    cursor.style.display = "none";
}