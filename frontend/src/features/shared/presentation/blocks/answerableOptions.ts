//The answers a learner can actually pick, each with its position in the
//author's list. An author may leave a spare answer box empty, which the submit
//checks allow, so empty ones are skipped here. The position is kept rather than
//renumbered because the answer is recorded against it: the second option is
//position 1 whether or not an empty one came before it.
export interface $AnswerableOption {
  position: number
  text: string
}

export function answerableOptions(options: readonly string[]): $AnswerableOption[] {
  return options
    .map((text, position) => ({ position, text: text.trim() }))
    .filter(option => option.text !== '')
}
