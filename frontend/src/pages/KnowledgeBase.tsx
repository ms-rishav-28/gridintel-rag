import { useEffect, useRef, useState } from 'react'
import { useKnowledgeStore, type DocumentItem } from '../stores/knowledgeStore'
import toast from 'react-hot-toast'

const KnowledgeBase = () => {
  const { documents, isLoadingDocs, isUploading, uploadError, fetchDocuments, uploadFile, removeDocument } = useKnowledgeStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeFilter, setActiveFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const success = await uploadFile(file)
    if (success) {
      toast.success(`"${file.name}" uploaded and ingested successfully!`)
    } else {
      toast.error(uploadError || 'Upload failed')
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = async (doc: DocumentItem) => {
    if (!confirm(`Remove "${doc.filename}" from the knowledge base?`)) return
    const success = await removeDocument(doc.doc_id)
    if (success) {
      toast.success(`"${doc.filename}" removed.`)
    } else {
      toast.error('Failed to remove document.')
    }
  }

  const filteredDocs = documents.filter((doc) => {
    const matchesFilter = activeFilter === 'ALL' || doc.doc_type === activeFilter
    const matchesSearch = !searchQuery || doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesFilter && matchesSearch
  })

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
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={handleUpload} />

      {/* Hero Header */}
      <section className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-on-surface tracking-tighter font-headline mb-2">Technical Repository</h1>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${documents.length > 0 ? 'bg-secondary' : 'bg-outline'}`}></span>
            <p className="font-label text-sm uppercase tracking-widest text-on-surface-variant">
              {isLoadingDocs ? 'Loading...' : `${documents.length} Active Documentation Volumes Ingested`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-4 py-2 bg-primary text-on-primary font-bold text-sm rounded-lg flex items-center gap-2 hover:bg-primary-container transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">{isUploading ? 'hourglass_top' : 'upload_file'}</span>
            {isUploading ? 'Ingesting...' : 'Upload Document'}
          </button>
          <span className="px-3 py-1 bg-secondary-container text-on-secondary-container font-label text-xs font-bold rounded-sm">V2.4 LATEST</span>
        </div>
      </section>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-surface-container rounded-xl">
        {['ALL', 'CEA_GUIDELINE', 'TECHNICAL_MANUAL', 'IT_CIRCULAR'].map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-label text-sm font-medium transition-colors cursor-pointer ${
              activeFilter === filter
                ? 'bg-surface-container-lowest text-primary font-bold'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {filter === 'ALL' && <span className="material-symbols-outlined text-sm">filter_list</span>}
            {filter === 'ALL' ? 'All Documents' : docTypeLabel(filter)}
          </button>
        ))}
        <div className="ml-auto relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
          <input
            className="bg-surface-container-lowest border-none focus:ring-2 focus:ring-primary h-9 pl-9 pr-4 rounded-lg text-sm font-body w-56"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* AI Insights Card */}
        <div className="md:col-span-4 bg-primary p-6 rounded-xl text-on-primary">
          <div className="flex items-center justify-between mb-4">
            <span className="material-symbols-outlined">auto_awesome</span>
            <span className="font-label text-[10px] opacity-70 tracking-widest">AI INSIGHTS</span>
          </div>
          <p className="text-sm leading-relaxed mb-4">
            {documents.length > 0
              ? `AI has indexed ${documents.reduce((sum, d) => sum + d.chunks_count, 0)} chunks from ${documents.length} documents for instant retrieval.`
              : 'Upload documents to enable AI-powered search and retrieval across your knowledge base.'}
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-on-primary text-primary py-2 rounded-lg font-bold text-sm hover:bg-primary-container hover:text-on-primary transition-colors"
          >
            {documents.length > 0 ? 'Add More Documents' : 'Upload Your First Document'}
          </button>
        </div>

        {/* Documents List */}
        <div className="md:col-span-8 space-y-4">
          {isLoadingDocs ? (
            <div className="bg-surface-container-lowest p-12 rounded-xl flex flex-col items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-primary/30 animate-spin mb-4">progress_activity</span>
              <p className="text-on-surface-variant text-sm">Loading documents...</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="bg-surface-container-lowest p-12 rounded-xl flex flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-5xl text-primary/20 mb-4">folder_open</span>
              <h4 className="text-lg font-bold text-on-surface/50 mb-2">
                {documents.length === 0 ? 'No Documents Yet' : 'No Matching Documents'}
              </h4>
              <p className="text-sm text-on-surface-variant max-w-sm">
                {documents.length === 0
                  ? 'Upload PDF, DOCX, or TXT files to build your knowledge base for AI-powered retrieval.'
                  : 'Try adjusting your search or filter criteria.'}
              </p>
            </div>
          ) : (
            filteredDocs.map((doc) => (
              <DocumentCard key={doc.doc_id} doc={doc} onDelete={handleDelete} />
            ))
          )}
        </div>

        {/* Semantic Discovery */}
        <div className="md:col-span-12 bg-surface-container-high/50 p-8 rounded-xl flex flex-col md:flex-row gap-8 items-center">
          <div className="flex-1">
            <h4 className="text-xl font-bold font-headline mb-2">Semantic Discovery</h4>
            <p className="text-on-surface-variant text-sm mb-6">
              Our AI has mapped dependencies between CEA guidelines and internal maintenance manuals. Use the Semantic Map to find related documents across different categories.
            </p>
            <div className="flex gap-4">
              <button className="bg-primary text-on-primary px-6 py-2 rounded-lg font-bold text-sm">Visualize Map</button>
              <button className="bg-surface-container-lowest text-primary px-6 py-2 rounded-lg font-bold text-sm">Review Conflicts</button>
            </div>
          </div>
          <div className="w-full md:w-1/3 aspect-video bg-surface-container-highest rounded-lg relative overflow-hidden border-2 border-primary/10">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-6xl text-primary/20">hub</span>
            </div>
            <div className="absolute bottom-2 right-2 bg-primary/80 backdrop-blur px-2 py-1 rounded text-[8px] text-on-primary font-label">LIVE GRAPH</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Document Card ────────────────────────────────────────────

function DocumentCard({ doc, onDelete }: { doc: DocumentItem; onDelete: (doc: DocumentItem) => void }) {
  const typeColors: Record<string, string> = {
    CEA_GUIDELINE: 'border-primary text-primary',
    TECHNICAL_MANUAL: 'border-secondary text-secondary',
    IT_CIRCULAR: 'border-tertiary text-tertiary',
  }

  const typeLabels: Record<string, string> = {
    CEA_GUIDELINE: 'CEA Guideline',
    TECHNICAL_MANUAL: 'Technical Manual',
    IT_CIRCULAR: 'IT Circular',
    TEXT_DOCUMENT: 'Text Document',
  }

  const borderColor = typeColors[doc.doc_type]?.split(' ')[0] || 'border-outline'

  return (
    <div className={`bg-surface-container-lowest p-6 rounded-xl border-l-4 ${borderColor} flex items-center gap-6 group hover:shadow-md transition-shadow`}>
      <span className="material-symbols-outlined text-primary text-2xl shrink-0">description</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`font-label text-[10px] uppercase font-bold tracking-widest ${typeColors[doc.doc_type]?.split(' ')[1] || 'text-on-surface-variant'}`}>
            {typeLabels[doc.doc_type] || doc.doc_type}
          </span>
          {doc.equipment_type && (
            <span className="text-[10px] font-label text-outline bg-surface-container px-2 py-0.5 rounded">{doc.equipment_type}</span>
          )}
          {doc.voltage_level && (
            <span className="text-[10px] font-label text-outline bg-surface-container px-2 py-0.5 rounded">{doc.voltage_level}</span>
          )}
        </div>
        <h4 className="text-sm font-bold font-headline truncate">{doc.filename}</h4>
        <span className="text-xs font-label text-on-surface-variant">{doc.chunks_count} chunks indexed</span>
      </div>
      <button
        onClick={() => onDelete(doc)}
        className="p-2 text-error/50 hover:text-error hover:bg-error-container rounded-lg transition-all opacity-0 group-hover:opacity-100"
        title="Remove document"
      >
        <span className="material-symbols-outlined text-sm">delete</span>
      </button>
    </div>
  )
}

export default KnowledgeBase
