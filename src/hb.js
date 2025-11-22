import Handlebars from "handlebars";
import repeat from "handlebars-helper-repeat";
import helpers from "handlebars-helpers";

Handlebars.registerHelper('repeat', repeat);

helpers({
  handlebars: Handlebars
});

export async function hb(src, tpl) {
    const template = Handlebars.compile(tpl);
    return template(src);
}