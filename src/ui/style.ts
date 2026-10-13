export const STYLE = String.raw`:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
  background: #111516;
  color: #e4ebea;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
header {
  padding: 22px max(24px, calc((100vw - 960px) / 2));
  border-bottom: 1px solid #33403e;
  display: flex;
  justify-content: space-between;
  gap: 20px;
  font-size: 13px;
}
.brand {
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #94cabc;
}
main {
  max-width: 1008px;
  padding: 42px 24px;
  margin: auto;
}
h1 {
  font-size: 36px;
  letter-spacing: -0.04em;
  margin: 0 0 10px;
}
h2 {
  font-size: 20px;
  margin: 0 0 18px;
}
.intro,
section > p,
footer {
  color: #a6b6b2;
  line-height: 1.65;
}
section {
  padding: 30px 0;
  border-bottom: 1px solid #33403e;
}
label {
  display: block;
  font-size: 14px;
  margin: 14px 0 7px;
}
input,
select,
button {
  font: inherit;
  border: 1px solid #52645f;
  border-radius: 6px;
  padding: 10px 13px;
  background: #1d2724;
  color: inherit;
}
input {
  width: 100%;
}
button {
  cursor: pointer;
}
button:hover {
  background: #30483e;
}
button:disabled {
  opacity: 0.5;
  cursor: wait;
}
button:focus-visible,
input:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 3px solid #92d8bd;
  outline-offset: 3px;
}
.actions {
  display: flex;
  gap: 10px;
  margin: 15px 0;
}
.field {
  display: grid;
  grid-template-columns: 1fr 220px;
  align-items: center;
  gap: 8px 24px;
}
.source {
  font-size: 12px;
  color: #a6b6b2;
}
#config > button {
  margin-top: 22px;
}
#message {
  min-height: 28px;
  color: #9cdec1;
}
#message.error {
  color: #ffb8ab;
}
output {
  display: block;
  font-size: 28px;
  letter-spacing: 0.12em;
  margin: 14px 0;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 16px;
  background: #1b2321;
  font-size: 13px;
}
details {
  margin-top: 22px;
}
summary {
  cursor: pointer;
}
.agent,
.profile {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 16px 0;
  border-bottom: 1px solid #26352f;
}
.agent span,
.profile span {
  flex: 1;
}
footer {
  font-size: 13px;
  margin: 28px 0;
}
@media (max-width: 600px) {
  main {
    padding-top: 28px;
  }
  .field {
    display: block;
  }
  header {
    flex-direction: column;
    gap: 8px;
  }
  h1 {
    font-size: 30px;
  }
  .agent button {
    font-size: 13px;
  }
}
`;
