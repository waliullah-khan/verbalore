// A brain document applies to every use case (no tag) or to one. General content is the workspace's
// own business, so it also draws on documents written for the GTM tab.
export function docsForUseCase<T extends { use_case?: string | null }>(docs: T[], useCase: string): T[] {
  return docs.filter((d) => !d.use_case || d.use_case === useCase || (useCase === "general" && d.use_case === "gtm"));
}
