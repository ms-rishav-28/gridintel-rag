import { useEffect, useMemo, useRef, useState } from 'react'
import { useKnowledgeStore, type DocumentItem } from '../stores/knowledgeStore'
import toast from 'react-hot-toast'

const KnowledgeBase = () => {
  const {
    documents,
    isLoadingDocs,
    isUploading,
    uploadError,
    metadataOptions,
    isLoadingMetadata,
    fetchDocuments,
    fetchMetadataOptions,
    uploadFile,
    uploadFiles,
    removeDocument,
  } = useKnowledgeStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeFilter, setActiveFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadDocType, setUploadDocType] = useState('')
  const [uploadEquipmentType, setUploadEquipmentType] = useState('')
  const [uploadVoltageLevel, setUploadVoltageLevel] = useState('')

  useEffect(() => {
    fetchDocuments()
    fetchMetadataOptions()
  }, [fetchDocuments, fetchMetadataOptions])

  const totalChunks = useMemo(
    () => documents.reduce((sum, doc) => sum + doc.chunks_count, 0),
    [documents]
  )

  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      const matchesFilter = activeFilter === 'ALL' || doc.doc_type === activeFilter
      const matchesSearch =
        !searchQuery || doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesFilter && matchesSearch
    })
  }, [documents, activeFilter, searchQuery])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return

    if (selectedFiles.length === 1) {
      const file = selectedFiles[0]
      const success = await uploadFile(file, {
        doc_type: uploadDocType || undefined,
        equipment_type: uploadEquipmentType || undefined,
        voltage_level: uploadVoltageLevel || undefined,
      })

      if (success) {
        toast.success(`"${file.name}" uploaded and ingested successfully.`)
      } else {
        toast.error(uploadError || 'Upload failed')
      }
    } else {
      if (uploadDocType || uploadEquipmentType || uploadVoltageLevel) {
        toast('Metadata fields are applied only for single-file upload. Batch upload will auto-detect metadata.')
      }

      const result = await uploadFiles(selectedFiles)
      if (result.processed > 0) {
        toast.success(`Batch upload complete: ${result.processed} processed, ${result.failed} failed.`)
      } else {
        toast.error(uploadError || 'Batch upload failed')
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = async (doc: DocumentItem) => {
    if (!window.confirm(`Remove "${doc.filename}" from the knowledge base?`)) return

    const success = await removeDocument(doc.doc_id)
    if (success) {
      toast.success(`"${doc.filename}" removed.`)
    } else {
      toast.error('Failed to remove document.')
    }
  }

  const docTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      CEA_GUIDELINE: 'CEA Guideline',
      TECHNICAL_MANUAL: 'Technical Manual',
      IT_CIRCULAR: 'IT Circular',
      TEXT_DOCUMENT: 'Text Document',
    }
    return map[type] || type
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 md:p-8">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        className="hidden"
        onChange={handleUpload}
        multiple
      />

      <section className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-headline text-4xl font-black tracking-tighter text-on-surface md:text-5xl">
            Technical Repository
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${documents.length > 0 ? 'bg-secondary' : 'bg-outline'}`}></span>
            <p className="font-label text-sm uppercase tracking-widest text-on-surface-variant">
              {isLoadingDocs
                ? 'Loading documentation state...'
                : `${documents.length} active docs · ${totalChunks} indexed chunks`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-all hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">
              {isUploading ? 'hourglass_top' : 'upload_file'}
            </span>
            {isUploading ? 'Ingesting...' : 'Upload Documents'}
          </button>
          <span className="rounded-sm bg-secondary-container px-3 py-1 font-label text-xs font-bold text-on-secondary-container">
            V2.4 LATEST
          </span>
        </div>
      </section>

      <section className="rounded-xl bg-surface-container p-4">
        <h2 className="mb-3 font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          Upload Metadata (optional, single-file mode)
        </h2>
        <div className="grid gap-3 md:grid-cols-4">
          <select
            value={uploadDocType}
            onChange={(e) => setUploadDocType(e.target.value)}
            className="rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
            disabled={isLoadingMetadata}
          >
            <option value="">Auto document type</option>
            {(metadataOptions?.document_types || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={uploadEquipmentType}
            onChange={(e) => setUploadEquipmentType(e.target.value)}
            className="rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
            disabled={isLoadingMetadata}
          >
            <option value="">Auto equipment type</option>
            {(metadataOptions?.equipment_types || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={uploadVoltageLevel}
            onChange={(e) => setUploadVoltageLevel(e.target.value)}
            className="rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
            disabled={isLoadingMetadata}
          >
            <option value="">Auto voltage level</option>
            {(metadataOptions?.voltage_levels || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="rounded-lg bg-surface-container-lowest px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Select Files
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-surface-container p-4">
        {['ALL', 'CEA_GUIDELINE', 'TECHNICAL_MANUAL', 'IT_CIRCULAR', 'TEXT_DOCUMENT'].map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`rounded-lg px-4 py-2 font-label text-sm font-medium transition-colors ${
              activeFilter === filter
                ? 'bg-surface-container-lowest font-bold text-primary'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {filter === 'ALL' ? 'All Documents' : docTypeLabel(filter)}
          </button>
        ))}

        <div className="relative ml-auto min-w-[220px] flex-1 md:max-w-sm md:flex-none">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            search
          </span>
          <input
            className="h-9 w-full rounded-lg bg-surface-container-lowest pl-9 pr-4 text-sm focus:ring-2 focus:ring-primary"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <div className="rounded-xl bg-primary p-6 text-on-primary md:col-span-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="material-symbols-outlined">auto_awesome</span>
            <span className="font-label text-[10px] tracking-widest opacity-80">AI INSIGHTS</span>
          </div>
          <p className="mb-4 text-sm leading-relaxed">
            {documents.length > 0
              ? `AI indexed ${totalChunks} chunks from ${documents.length} documents for retrieval-ready responses.`
              : 'Upload PDF, DOCX, DOC, or TXT files to activate semantic retrieval across your repository.'}
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-lg bg-on-primary py-2 text-sm font-bold text-primary transition-colors hover:bg-primary-container hover:text-on-primary"
          >
            {documents.length > 0 ? 'Add More Documents' : 'Upload First Document'}
          </button>
        </div>

        <div className="space-y-4 md:col-span-8">
          {isLoadingDocs ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-surface-container-lowest p-12">
              <span className="material-symbols-outlined mb-4 animate-spin text-4xl text-primary/30">progress_activity</span>
              <p className="text-sm text-on-surface-variant">Loading documents...</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-surface-container-lowest p-12 text-center">
              <span className="material-symbols-outlined mb-4 text-5xl text-primary/20">folder_open</span>
              <h4 className="mb-2 text-lg font-bold text-on-surface/60">
                {documents.length === 0 ? 'No Documents Yet' : 'No Matching Documents'}
              </h4>
              <p className="max-w-sm text-sm text-on-surface-variant">
                {documents.length === 0
                  ? 'Upload source files to build your RAG knowledge repository.'
                  : 'Try adjusting your search text or document type filter.'}
              </p>
            </div>
          ) : (
            filteredDocs.map((doc) => (
              <DocumentCard key={doc.doc_id} doc={doc} onDelete={handleDelete} />
            ))
          )}
        </div>

        <div className="rounded-xl bg-surface-container-high/50 p-8 md:col-span-12">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="flex-1">
              <h4 className="font-headline text-xl font-bold">Semantic Discovery</h4>
              <p className="mt-2 text-sm text-on-surface-variant">
                Retrieval graph processing links CEA standards, technical manuals, and circular updates to reduce missed references in high-stakes responses.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button className="rounded-lg bg-primary px-6 py-2 text-sm font-bold text-on-primary">
                  Visualize Map
                </button>
                <button className="rounded-lg bg-surface-container-lowest px-6 py-2 text-sm font-bold text-primary">
                  Review Conflicts
                </button>
              </div>
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border-2 border-primary/10 bg-surface-container-highest md:w-1/3">
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-6xl text-primary/20">hub</span>
              </div>
              <div className="absolute bottom-2 right-2 rounded bg-primary/80 px-2 py-1 font-label text-[8px] text-on-primary">
                LIVE GRAPH
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DocumentCard({
  doc,
  onDelete,
}: {
  doc: DocumentItem
  onDelete: (doc: DocumentItem) => void
}) {
  const typeColors: Record<string, string> = {
    CEA_GUIDELINE: 'border-primary text-primary',
    TECHNICAL_MANUAL: 'border-secondary text-secondary',
    IT_CIRCULAR: 'border-tertiary text-tertiary',
    TEXT_DOCUMENT: 'border-outline text-on-surface-variant',
  }

  const typeLabels: Record<string, string> = {
    CEA_GUIDELINE: 'CEA Guideline',
    TECHNICAL_MANUAL: 'Technical Manual',
    IT_CIRCULAR: 'IT Circular',
    TEXT_DOCUMENT: 'Text Document',
  }

  const borderColor = typeColors[doc.doc_type]?.split(' ')[0] || 'border-outline'

  return (
    <div
      className={`group flex items-center gap-4 rounded-xl border-l-4 ${borderColor} bg-surface-container-lowest p-5 transition-shadow hover:shadow-md md:gap-6 md:p-6`}
    >
      <span className="material-symbols-outlined shrink-0 text-2xl text-primary">description</span>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span
            className={`font-label text-[10px] font-bold uppercase tracking-widest ${
              typeColors[doc.doc_type]?.split(' ')[1] || 'text-on-surface-variant'
            }`}
          >
            {typeLabels[doc.doc_type] || doc.doc_type}
          </span>
          {doc.equipment_type && (
            <span className="rounded bg-surface-container px-2 py-0.5 font-label text-[10px] text-outline">
              {doc.equipment_type}
            </span>
          )}
          {doc.voltage_level && (
            <span className="rounded bg-surface-container px-2 py-0.5 font-label text-[10px] text-outline">
              {doc.voltage_level}
            </span>
          )}
        </div>

        <h4 className="truncate font-headline text-sm font-bold md:text-base">{doc.filename}</h4>
        <span className="font-label text-xs text-on-surface-variant">{doc.chunks_count} chunks indexed</span>
      </div>

      <button
        onClick={() => onDelete(doc)}
        className="rounded-lg p-2 text-error/70 transition-all hover:bg-error-container hover:text-error md:opacity-0 md:group-hover:opacity-100"
        title="Remove document"
      >
        <span className="material-symbols-outlined text-sm">delete</span>
      </button>
    </div>
  )
}

export default KnowledgeBase
