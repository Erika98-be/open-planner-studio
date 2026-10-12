export const meta = {
  name: 'vertaalstraat-stations',
  description: 'Vertaalstraat: per pakket vertalen, nalezen en herstellen met Haiku (UI of docs)',
  phases: [{ title: 'Vertalen', model: 'haiku' }, { title: 'Nalezen', model: 'haiku' }, { title: 'Herstellen', model: 'haiku' }],
}
// De drie stations van de vertaalstraat, per pakket achter elkaar; de pakketten lopen naast elkaar.
// Gestart door de skills update-ui-lang en update-docs-lang (Workflow-tool, scriptPath = dit bestand).
// args: {
//   kind:  'ui' | 'docs'                  welke opdrachten: prompts/<kind>.md, <kind>-review.md, <kind>-fix.md
//   repo:  absoluut pad van de worktree   (pakketten in <repo>/build/translate/<taal>/)
//   node:  absoluut pad van node          (agent-shells laden nvm niet)
//   items: [[taal, pakket-id], …]         uitvoer van `npm run translate -- packages <kind> <taal…> [--red]`
// }
const ROOT = `${args.repo}/build/translate`
const PROMPTS = `${args.repo}/scripts/translate/prompts`
const SCHEMA = { type: 'object', properties: { problems: { type: 'number' } }, required: ['problems'] }
const vars = (lang, id) => {
  const dir = `${ROOT}/${lang}`
  return `Placeholders for the instructions: {{PACKAGE}} = ${dir}/${id}.json ; {{PACKAGES}} = ${dir}/${id}.json ; `
    + `{{PACKAGE_DIR}} = ${dir} ; {{ID}} = ${id} ; {{REVIEW_FILE}} = ${dir}/review-${id}.json ; `
    + `{{NODE}} = ${args.node} ; {{CHECK}} = ${ROOT}/check.mjs`
}
const task = (file, lang, id) =>
  `Your instructions are in the file ${PROMPTS}/${file}. Read that file first and follow it exactly, with these values filled in.\n`
  + `${vars(lang, id)}\nYou may read that instruction file in addition to the files it names.`
const tail = (s) => (typeof s === 'string' ? s.slice(-150) : s)
const k = args.kind
if (k !== 'ui' && k !== 'docs') throw new Error(`kind moet "ui" of "docs" zijn, niet ${k}`)
const res = await pipeline(args.items,
  ([lang, id]) => agent(task(`${k}.md`, lang, id), { label: `${k}:${lang}:${id}`, phase: 'Vertalen', model: 'haiku' })
    .then((t) => ({ t: tail(t) })),
  (prev, [lang, id]) => agent(`${task(`${k}-review.md`, lang, id)}\n\nReturn the number of problems you wrote as \`problems\`.`,
    { label: `review:${lang}:${id}`, phase: 'Nalezen', model: 'haiku', schema: SCHEMA })
    .then((r) => ({ ...prev, problems: r ? r.problems : null })),
  (prev, [lang, id]) => (!prev || !prev.problems) ? prev
    : agent(task(`${k}-fix.md`, lang, id), { label: `fix:${lang}:${id}`, phase: 'Herstellen', model: 'haiku' })
      .then((f) => ({ ...prev, fix: tail(f) })),
)
const out = res.map((r, i) => ({ lang: args.items[i][0], id: args.items[i][1], problems: r ? r.problems : null, failed: !r }))
return {
  total: out.length,
  failed: out.filter((o) => o.failed).map((o) => `${o.lang}:${o.id}`),
  problems: out.reduce((s, o) => s + (o.problems || 0), 0),
}
