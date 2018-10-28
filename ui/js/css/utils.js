export const breakPointSmall = 480;
export const breakPointDrawerSmall = 650;
export const breakPointDrawerMedium = 900;

/*
 * Removes a style from head.
 */
const remove = id => {
  if (id) {
    const old = document.getElementById(id);
    if (old && old.parentNode) {
      old.parentNode.removeChild(old);
    }
  }
};

export function addToDocument(sheet, opts) {
  opts = opts || {};
  const id = opts.id;
  remove(id);
  const style = document.createElement('style');
  if (id) {
    style.setAttribute("id", id);
  }
  style.type = 'text/css'; // my not even be needed
  style.appendChild(document.createTextNode(sheet));
  document.head.appendChild(style);
}
