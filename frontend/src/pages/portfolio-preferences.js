export const portfolioSections = { streak:'Journal streak', adherence:'Rules followed', reviews:'Trades reviewed', photo:'Profile picture', setupStats:'Playbook setup stats' };
export const portfolioPath = slug => '/p/' + encodeURIComponent(slug);
export const portfolioVisibilityMarkup = `
  <label>Who can see it<select name="visibility">
    <option value="private">Private</option>
    <option value="link">Anyone with the link</option>
    <option value="public">Public</option>
  </select></label>
  <fieldset><legend>What it shows</legend>
    ${Object.entries(portfolioSections).map(([key,label])=>`<label class="ws-check"><input type="checkbox" name="${key}"> ${label}</label>`).join('')}
  </fieldset>`;

export function fillPortfolioVisibility(form, portfolio) {
  form.elements.visibility.value = portfolio?.visibility ?? 'private';
  for (const key of Object.keys(portfolioSections)) form.elements[key].checked = portfolio?.sections?.[key] === true;
}
export function readPortfolioVisibility(values) {
  return {
    visibility: values.visibility,
    sections: Object.fromEntries(Object.keys(portfolioSections).map(key=>[key,Boolean(values[key])])),
  };
}
