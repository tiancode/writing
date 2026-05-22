import DocumentEditor from "@/components/DocumentEditor";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DocumentPage({ params }: Props) {
  const { id } = await params;
  return <DocumentEditor documentId={id} />;
}
