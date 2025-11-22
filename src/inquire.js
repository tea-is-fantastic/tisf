import {
  checkbox, confirm,
  editor,
  expand,
  input,
  number,
  password,
  rawlist,
  search,
  select
} from '@inquirer/prompts';

const prompts = {
  input, select, checkbox, confirm, number,
  search, password, expand, editor, rawlist
};

export const inquire = async (questions) => {
  const answers = {};
  for (const x of questions) {
    const { name, type } = x
    delete x.name
    delete x.type
    answers[name] = await prompts[type]({ ...x })
  }
  return answers;
}