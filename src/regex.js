import regexpTree from "regexp-tree";
import { replaceInFile } from "replace-in-file";
import fs from 'fs';
import path from 'path';
import { normalize } from "./normalize";

export async function handleRegex(files, re, rep, already, callback) {
  try {
    const filecont = await fs.promises.readFile(files, 'utf-8');
    if (already && filecont.includes(already)) {
      return;
    }

    const reg = regexpTree.toRegExp(re);
    let to = rep;

    if (callback) {
      to = input => callback(input.replace(reg, rep));
    }

    const results = await replaceInFile({
      files,
      from: reg,
      to,
    });

    console.log('Replacement results:', results);
  } catch (error) {
    console.error('Error occurred:', error);
  }
}

export const regex = async (url) => {
  const yaml = await normalize(url, {yml: true});
  const pth = path.resolve(...yaml.path);

  for (const a of yaml.data) {
    console.log(a);
    await handleRegex(
      pth,
      a.find && a.find.trim(),
      a.replace && a.replace.trim(),
      a.already && a.already.trim()
    );
  }

  console.log('Project setup complete.');
};
