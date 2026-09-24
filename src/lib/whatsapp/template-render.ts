export function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, raw: string) => {
    const index = Number(raw) - 1;
    return params[index] ?? `{{${raw}}}`;
  });
}
