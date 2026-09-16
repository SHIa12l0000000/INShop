import Shop from "../../components/shop";
export default async function Route({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  return <Shop route={"/" + path.join("/")} />;
}
