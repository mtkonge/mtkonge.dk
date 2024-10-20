import "./style.css"

const input = document.querySelector<HTMLInputElement>("#terminal-input")!;
const cursor = document.querySelector<HTMLSpanElement>("#cursor")!;
const history = document.querySelector<HTMLDivElement>("#history")!;
const userPrefix = document.querySelector<HTMLDivElement>("#user")!;

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

input.addEventListener("keydown", function(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    addHistoryItem(runCommand(input.value))
  }
  else if (event.ctrlKey && event.key === 'c') {
    addHistoryItem("")
  }

}) 

function runCommand(command: string) {
  if (command.trim() !== "") {
    return `${command}: Command not found`
  }
  else {
    return ""
  }
}

function addHistoryItem(output: string) {
  const userPrefixClone = userPrefix.cloneNode(true) as HTMLDivElement
  userPrefixClone.id = ""

  const command = document.createElement("div")
  command.innerHTML = input.value

  const userAndCommand = document.createElement("div")
  userAndCommand.classList.add("user-and-command")
  userAndCommand.appendChild(userPrefixClone)
  userAndCommand.appendChild(command)

  const outputElement = document.createElement("div")
  outputElement.innerHTML = output


  const historyItem = document.createElement("div")
  historyItem.classList.add("history-list")

  historyItem.appendChild(userAndCommand)
  historyItem.appendChild(outputElement)

  history.appendChild(historyItem)
  input.value = ""
}


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
  const charWidthPx = 10;

  const cursorPosition = input.selectionStart!;
  const cursorLeft = (prefixChars + cursorPosition) * charWidthPx + marginPx + offsetPx

  cursor.style.left = cursorLeft + "px";
}

function showCursor() {
    cursor.style.display = "inline-block";
}

function hideCursor() {
    cursor.style.display = "none";
}
