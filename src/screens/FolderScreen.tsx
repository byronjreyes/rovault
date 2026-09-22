import { useState, useRef, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Folder as FolderIcon,
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  FileText,
  Search,
  PanelLeft,
  PanelLeftClose,
  Upload,
  Download,
  File,
  FileSpreadsheet,
  FileText as FileDocIcon,
  Image as ImageIcon,
  LayoutGrid,
  List as ListIcon,
  Eye,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { api, type NoteFolder, type NoteFile, type VaultDocFile, emptyNote } from "@/lib/api";
import { cn } from "@/lib/utils";
import { NoteEditor } from "./NoteEditor";

interface FolderScreenProps {
  folders: NoteFolder[];
  notes: NoteFile[];
  files: VaultDocFile[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onRefresh: () => Promise<void>;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(name: string, mime: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"].includes(ext) || mime.startsWith("image/")) {
    return { icon: ImageIcon, color: "text-amber-500", bg: "bg-amber-500/10", label: "Image" };
  }
  if (["xls", "xlsx", "csv"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel")) {
    return { icon: FileSpreadsheet, color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Spreadsheet" };
  }
  if (["doc", "docx", "rtf", "odt"].includes(ext) || mime.includes("word") || mime.includes("document")) {
    return { icon: FileDocIcon, color: "text-blue-500", bg: "bg-blue-500/10", label: "Document" };
  }
  if (ext === "pdf" || mime.includes("pdf")) {
    return { icon: FileText, color: "text-rose-500", bg: "bg-rose-500/10", label: "PDF" };
  }
  return { icon: File, color: "text-zinc-400", bg: "bg-zinc-500/10", label: ext.toUpperCase() || "File" };
}

// Global in-memory deduplication cache: key = `${name}:${size}:${folderId}`, value = timestamp
const recentFileSaves = new Map<string, number>();

function isDuplicateDrop(name: string, size: number, folderId: string | null | undefined): boolean {
  const key = `${name}:${size}:${folderId || "root"}`;
  const lastTime = recentFileSaves.get(key) || 0;
  const now = Date.now();
  if (now - lastTime < 5000) {
    return true;
  }
  recentFileSaves.set(key, now);
  if (recentFileSaves.size > 200) {
    for (const [k, time] of recentFileSaves.entries()) {
      if (now - time > 10000) recentFileSaves.delete(k);
    }
  }
  return false;
}

export function FolderScreen({
  folders,
  notes,
  files,
  selectedFolderId,
  onSelectFolder,
  onRefresh,
  sidebarCollapsed,
  onToggleSidebar,
}: FolderScreenProps) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<NoteFolder | null>(null);
  const [deleteFileTarget, setDeleteFileTarget] = useState<VaultDocFile | null>(null);
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<NoteFile | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null);
  const [activeEditingNote, setActiveEditingNote] = useState<NoteFile | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileUploadInputRef = useRef<HTMLInputElement>(null);

  const currentFolder = folders.find((f) => f.id === selectedFolderId);

  // Filter items
  const q = search.trim().toLowerCase();

  const visibleFolders = selectedFolderId
    ? [] // When drilled down into a folder, hide other folders
    : folders.filter((f) => !q || f.name.toLowerCase().includes(q));

  const visibleFiles = files.filter((f) => {
    if (selectedFolderId) {
      if (f.folder_id !== selectedFolderId) return false;
    } else {
      // In root overview, show all or unfiled
      if (f.folder_id !== null && f.folder_id !== undefined) return false;
    }
    return !q || f.name.toLowerCase().includes(q);
  });

  const visibleNotes = notes.filter((n) => {
    if (selectedFolderId) {
      if (n.folder_id !== selectedFolderId) return false;
    } else {
      if (n.folder_id !== null && n.folder_id !== undefined) return false;
    }
    return !q || n.title.toLowerCase().includes(q);
  });

  const selectedFolderIdRef = useRef(selectedFolderId);
  selectedFolderIdRef.current = selectedFolderId;

  const foldersRef = useRef(folders);
  foldersRef.current = folders;

  const isProcessingRef = useRef(false);

  // Unified batch upload for files (from input or HTML5 drop)
  const handleProcessFiles = async (
    filesList: FileList | File[],
    targetFolderId?: string | null
  ) => {
    if (!filesList || filesList.length === 0) return;
    const destFolderId = targetFolderId !== undefined ? targetFolderId : selectedFolderIdRef.current;

    const filesToUpload: VaultDocFile[] = [];
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      if (isDuplicateDrop(file.name, file.size, destFolderId)) {
        continue;
      }

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        filesToUpload.push({
          id: "",
          folder_id: destFolderId || null,
          name: file.name,
          size: file.size,
          mime: file.type || "application/octet-stream",
          data: base64,
          created_at: 0,
          updated_at: 0,
        });
      } catch (err) {
        toast(`Failed to read ${file.name}: ${err}`, "error");
      }
    }

    if (filesToUpload.length === 0) {
      return;
    }

    setIsUploading(true);
    try {
      const saved = await api.upsertFiles(filesToUpload);
      if (saved.length > 0) {
        const targetFolderObj = foldersRef.current.find((f) => f.id === destFolderId);
        const destName = targetFolderObj ? `"${targetFolderObj.name}"` : "Documents";
        toast(
          `${saved.length} ${saved.length === 1 ? "file" : "files"} encrypted and saved into ${destName}`,
          "success"
        );
        await onRefresh();
      }
    } catch (e) {
      toast(`Failed to save files: ${e}`, "error");
    } finally {
      setIsUploading(false);
    }
  };

  // Tauri OS-level drag & drop handler
  const handleDropPaths = async (
    paths: string[],
    position?: { x: number; y: number }
  ) => {
    if (!paths || paths.length === 0) return;
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const currentSelectedFolderId = selectedFolderIdRef.current;
      let destFolderId = currentSelectedFolderId;

      if (position && !currentSelectedFolderId) {
        const el = document.elementFromPoint(position.x, position.y);
        const folderEl = el?.closest("[data-folder-id]");
        if (folderEl) {
          const foundId = folderEl.getAttribute("data-folder-id");
          if (foundId) {
            destFolderId = foundId;
          }
        }
      }

      const filesToUpload: VaultDocFile[] = [];
      for (const p of paths) {
        try {
          const fileInfo = await api.readDroppedFile(p);
          if (isDuplicateDrop(fileInfo.name, fileInfo.size, destFolderId)) {
            continue;
          }
          filesToUpload.push({
            id: "",
            folder_id: destFolderId || null,
            name: fileInfo.name,
            size: fileInfo.size,
            mime: fileInfo.mime,
            data: fileInfo.data,
            created_at: 0,
            updated_at: 0,
          });
        } catch (e) {
          console.error("Failed to read dropped file path:", e);
        }
      }

      if (filesToUpload.length === 0) return;

      setIsUploading(true);
      try {
        const saved = await api.upsertFiles(filesToUpload);
        if (saved.length > 0) {
          const targetFolderObj = foldersRef.current.find((f) => f.id === destFolderId);
          const destName = targetFolderObj ? `"${targetFolderObj.name}"` : "Documents";
          toast(
            `${saved.length} ${saved.length === 1 ? "file" : "files"} encrypted and saved into ${destName}`,
            "success"
          );
          await onRefresh();
        }
      } catch (e) {
        toast(`Failed to import files: ${e}`, "error");
      } finally {
        setIsUploading(false);
      }
    } finally {
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 500);
    }
  };

  useEffect(() => {
    let active = true;
    const unlistens: (() => void)[] = [];

    const setupTauriDragDrop = async () => {
      try {
        const unDrop = await listen<any>("tauri://drag-drop", async (event) => {
          setIsDraggingOver(false);
          const payload = event.payload;
          const paths: string[] =
            payload?.paths ||
            payload?.files ||
            (Array.isArray(payload) ? payload : []);
          if (paths && paths.length > 0) {
            await handleDropPaths(paths, payload?.position);
          }
        });
        if (!active) {
          unDrop();
        } else {
          unlistens.push(unDrop);
        }

        const unEnter = await listen("tauri://drag-enter", () => {
          setIsDraggingOver(true);
        });
        if (!active) {
          unEnter();
        } else {
          unlistens.push(unEnter);
        }

        const unOver = await listen("tauri://drag-over", () => {
          setIsDraggingOver(true);
        });
        if (!active) {
          unOver();
        } else {
          unlistens.push(unOver);
        }

        const unLeave = await listen("tauri://drag-leave", () => {
          setIsDraggingOver(false);
        });
        if (!active) {
          unLeave();
        } else {
          unlistens.push(unLeave);
        }
      } catch (err) {
        console.warn("Tauri drag-drop listener error:", err);
      }
    };

    setupTauriDragDrop();

    return () => {
      active = false;
      unlistens.forEach((fn) => fn());
    };
  }, []);

  const handleDownloadFile = (file: VaultDocFile) => {
    try {
      const a = document.createElement("a");
      a.href = file.data;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast(`Downloaded ${file.name}`, "success");
    } catch (e) {
      toast(`Download failed: ${e}`, "error");
    }
  };

  const handleOpenFile = async (file: VaultDocFile) => {
    try {
      await api.openVaultFile(file.name, file.data);
      toast(`Opening "${file.name}"…`, "success");
    } catch (e) {
      toast(`Failed to open: ${e}`, "error");
    }
  };

  const handleSaveFolder = async () => {
    if (!folderName.trim()) {
      toast("Folder name cannot be empty", "error");
      return;
    }
    try {
      if (editingFolder) {
        await api.upsertFolder({ ...editingFolder, name: folderName.trim() });
        toast("Folder renamed", "success");
      } else {
        await api.upsertFolder({ id: "", name: folderName.trim(), created_at: 0, updated_at: 0 });
        toast("Folder created", "success");
      }
      setFolderDialogOpen(false);
      await onRefresh();
    } catch (e) {
      toast(`Folder error: ${e}`, "error");
    }
  };

  const handleDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    try {
      await api.deleteFolder(deleteFolderTarget.id);
      toast(`Folder "${deleteFolderTarget.name}" deleted (items moved to root)`, "success");
      setDeleteFolderTarget(null);
      if (selectedFolderId === deleteFolderTarget.id) {
        onSelectFolder(null);
      }
      await onRefresh();
    } catch (e) {
      toast(`Delete error: ${e}`, "error");
    }
  };

  const handleDeleteFile = async () => {
    if (!deleteFileTarget) return;
    try {
      await api.deleteFile(deleteFileTarget.id);
      toast(`File "${deleteFileTarget.name}" deleted`, "success");
      setDeleteFileTarget(null);
      await onRefresh();
    } catch (e) {
      toast(`Delete error: ${e}`, "error");
    }
  };

  const handleDeleteNote = async () => {
    if (!deleteNoteTarget) return;
    try {
      await api.deleteNote(deleteNoteTarget.id);
      toast(`Note "${deleteNoteTarget.title}" deleted`, "success");
      setDeleteNoteTarget(null);
      await onRefresh();
    } catch (e) {
      toast(`Delete error: ${e}`, "error");
    }
  };

  // If a note is currently open in editor
  if (activeEditingNote) {
    return (
      <NoteEditor
        note={activeEditingNote}
        folders={folders}
        onBack={() => {
          setActiveEditingNote(null);
          onRefresh();
        }}
        onSave={(saved) => {
          setActiveEditingNote(saved);
          onRefresh();
        }}
        onDelete={async (id) => {
          await api.deleteNote(id);
          toast("Note deleted", "success");
          setActiveEditingNote(null);
          await onRefresh();
        }}
      />
    );
  }

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden bg-background"
      onDragEnter={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDraggingOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
          handleProcessFiles(e.dataTransfer.files, selectedFolderIdRef.current);
        }
      }}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-md border-3 border-dashed border-amber-500 m-3 rounded-2xl animate-in fade-in-0 duration-150 pointer-events-none shadow-2xl">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-500/20 text-amber-500 mb-4 animate-bounce shadow-lg">
            <Upload className="h-10 w-10" />
          </div>
          <h3 className="text-xl font-bold text-foreground">Drop files to encrypt & save</h3>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-sm text-center">
            Word, Excel, PDF, Images — stored securely in {currentFolder ? `"${currentFolder.name}"` : "Documents"}
          </p>
        </div>
      )}

      {/* Header Bar */}
      <header className="flex items-center gap-3 border-b border-border/80 bg-card/40 px-5 py-3 backdrop-blur-md">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Back navigation when drilled down */}
        {selectedFolderId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectFolder(null)}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5 rounded-lg"
          >
            <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
            <span>Documents</span>
          </Button>
        )}

        {/* Folder Title or Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              selectedFolderId
                ? `Search in ${currentFolder?.name || "folder"}...`
                : "Search documents, files & folders..."
            }
            className="h-9 pl-9 pr-4 text-xs bg-background/50 border-border/80 rounded-xl"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-xl border border-border/80 bg-background/50 p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                viewMode === "grid"
                  ? "bg-muted text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                viewMode === "list"
                  ? "bg-muted text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="List View"
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Upload File CTA */}
          <Button
            variant="outline"
            size="default"
            disabled={isUploading}
            onClick={() => fileUploadInputRef.current?.click()}
            className="rounded-xl h-9 px-3.5 border-border/80 gap-1.5 text-xs font-medium shadow-xs"
            title="Upload Word, Excel, PDF, or any file"
          >
            <Upload className={cn("h-4 w-4 text-amber-500", isUploading && "animate-spin")} />
            <span className="hidden sm:inline">{isUploading ? "Encrypting..." : "Upload File"}</span>
          </Button>
          <input
            ref={fileUploadInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleProcessFiles(e.target.files, selectedFolderIdRef.current);
              }
              e.target.value = "";
            }}
          />

          {/* New Note in Folder */}
          <Button
            variant="outline"
            size="default"
            onClick={() => setActiveEditingNote(emptyNote(selectedFolderId))}
            className="rounded-xl h-9 px-3.5 border-border/80 gap-1.5 text-xs font-medium shadow-xs"
          >
            <FileText className="h-4 w-4 text-sky-500" />
            <span className="hidden sm:inline">New Note</span>
          </Button>

          {/* New Folder CTA */}
          {!selectedFolderId && (
            <Button
              size="default"
              onClick={() => {
                setEditingFolder(null);
                setFolderName("");
                setFolderDialogOpen(true);
              }}
              className="rounded-xl h-9 px-3.5 shadow-sm gap-1.5 text-xs font-medium"
            >
              <Plus className="h-4 w-4" />
              <span>New Folder</span>
            </Button>
          )}
        </div>
      </header>

      {/* Main Canvas */}
      <div className="flex-1 flex flex-col overflow-y-auto p-5 space-y-6">
        {/* Inside Folder Header Banner */}
        {currentFolder && (
          <div className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 backdrop-blur-xs shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500 shadow-sm">
                <FolderOpen className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  {currentFolder.name}
                  <Badge className="text-[10px] font-mono border-amber-500/40 text-amber-500 bg-amber-500/10">
                    {visibleFiles.length + visibleNotes.length} items
                  </Badge>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Drag and drop any files or add rich-text notes inside this encrypted folder.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 1. Folders Section (Shown in root view) */}
        {!selectedFolderId && visibleFolders.length > 0 && (
          <div className="shrink-0">
            <div className="flex items-center justify-between pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Folders ({visibleFolders.length})
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleFolders.map((folder) => {
                const noteCount = notes.filter((n) => n.folder_id === folder.id).length;
                const fileCount = files.filter((f) => f.folder_id === folder.id).length;
                const totalCount = noteCount + fileCount;

                return (
                  <div
                    key={folder.id}
                    data-folder-id={folder.id}
                    onClick={() => onSelectFolder(folder.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                        handleProcessFiles(e.dataTransfer.files, folder.id);
                      }
                    }}
                    className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-card/75 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-amber-500/50 hover:bg-card hover:shadow-md cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-500 border border-amber-500/20 group-hover:scale-105 transition-transform shadow-xs">
                          <FolderIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-bold text-foreground group-hover:text-amber-500 transition-colors">
                            {folder.name}
                          </h4>
                          <span className="text-xs text-muted-foreground">
                            {totalCount} {totalCount === 1 ? "item" : "items"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFolder(folder);
                            setFolderName(folder.name);
                            setFolderDialogOpen(true);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title="Rename Folder"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteFolderTarget(folder);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
                          title="Delete Folder"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground/80">
                      <span className="font-medium text-amber-500/80 group-hover:text-amber-500">
                        Open folder →
                      </span>
                      <span className="font-mono text-[10px]">
                        {new Date((folder.updated_at || Date.now() / 1000) * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. Documents & Files Section */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-2.5 shrink-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {selectedFolderId
                ? `Files & Notes in ${currentFolder?.name || "Folder"} (${visibleFiles.length + visibleNotes.length})`
                : `Unfiled Files & Notes (${visibleFiles.length + visibleNotes.length})`}
            </h3>
          </div>

          {visibleFiles.length === 0 && visibleNotes.length === 0 ? (
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingOver(false);
                if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                  handleProcessFiles(e.dataTransfer.files, selectedFolderIdRef.current);
                }
              }}
              className={cn(
                "flex-1 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 min-h-[300px] w-full",
                isDraggingOver
                  ? "border-amber-500 bg-amber-500/10 shadow-lg scale-[0.99]"
                  : "border-border/70 hover:border-amber-500/40 hover:bg-card/30"
              )}
            >
              <div
                className={cn(
                  "flex h-16 w-16 items-center justify-center rounded-3xl mb-4 transition-all duration-300",
                  isDraggingOver
                    ? "bg-amber-500/25 text-amber-500 scale-110 animate-bounce"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Upload className="h-8 w-8 text-amber-500" />
              </div>
              <h4 className="text-base font-bold text-foreground">
                {isDraggingOver ? "Release to drop files here" : "No documents here yet"}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm leading-relaxed">
                {isDraggingOver
                  ? "Files will be encrypted and stored instantly."
                  : "Drag and drop any files (Word, Excel, PDF, Images) or click below to add files or rich-text notes."}
              </p>
              <div className="mt-5 flex items-center gap-3">
                <Button
                  disabled={isUploading}
                  onClick={() => fileUploadInputRef.current?.click()}
                  className="h-10 px-5 rounded-xl gap-2 text-sm font-medium shadow-sm hover:shadow"
                >
                  <Upload className={cn("h-4 w-4", isUploading && "animate-spin")} />
                  <span>{isUploading ? "Encrypting..." : "Upload File"}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setActiveEditingNote(emptyNote(selectedFolderId))}
                  className="h-10 px-5 rounded-xl gap-2 text-sm font-medium border-border/80 hover:bg-accent"
                >
                  <FileText className="h-4 w-4" />
                  <span>New Note</span>
                </Button>
              </div>
            </div>
          ) : viewMode === "grid" ? (
            /* GRID / BIG CARDS VIEW */
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {/* Note Cards */}
              {visibleNotes.map((note) => {
                const snippet = note.content.replace(/<[^>]*>/g, "").slice(0, 140);
                const wordCount = snippet ? snippet.split(/\s+/).filter(Boolean).length : 0;

                return (
                  <div
                    key={`note-${note.id}`}
                    onClick={() => setActiveEditingNote(note)}
                    className="group relative flex flex-col justify-between rounded-2xl border border-border/70 bg-card/65 p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-sky-500/40 hover:bg-card hover:shadow-lg cursor-pointer min-h-[175px]"
                  >
                    <div>
                      {/* Top Row: Note icon + Badge & Delete */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition-all duration-200 shadow-xs">
                          <FileText className="h-4.5 w-4.5" />
                        </div>

                        <div className="flex items-center gap-1.5 min-w-0">
                          <Badge className="text-[10px] font-medium border-sky-500/30 text-sky-500 bg-sky-500/10 px-2 py-0.5">
                            Note
                          </Badge>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteNoteTarget(note);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete Note"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Note Title */}
                      <h4 className="mt-3.5 text-sm font-bold text-foreground tracking-tight line-clamp-1 group-hover:text-sky-500 transition-colors">
                        {note.title || "Untitled Note"}
                      </h4>

                      {/* Snippet Preview */}
                      <p className="mt-1.5 text-xs text-muted-foreground/80 line-clamp-3 leading-relaxed font-normal">
                        {snippet || <span className="italic text-muted-foreground/45">Empty note content…</span>}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground/70">
                      <span className="font-mono text-[10.5px]">
                        {new Date((note.updated_at || Date.now() / 1000) * 1000).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                        {wordCount > 0 ? `${wordCount} words` : "Empty"}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Uploaded File Cards */}
              {visibleFiles.map((file) => {
                const info = getFileIcon(file.name, file.mime);
                const IconComponent = info.icon;
                const isImage = file.mime.startsWith("image/");

                return (
                  <div
                    key={`file-${file.id}`}
                    className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-card/80 p-4 shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-card hover:shadow-md cursor-pointer"
                    onClick={() => {
                      if (isImage) {
                        setPreviewImage({ src: file.data, name: file.name });
                      } else {
                        handleOpenFile(file);
                      }
                    }}
                  >
                    <div>
                      {/* Image Thumbnail preview if image */}
                      {isImage && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage({ src: file.data, name: file.name });
                          }}
                          className="group/img relative mb-3 h-28 w-full overflow-hidden rounded-xl border border-border/50 bg-black/40 flex items-center justify-center cursor-pointer"
                        >
                          <img
                            src={file.data}
                            alt={file.name}
                            className="h-full w-full object-contain transition-transform duration-200 group-hover/img:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md shadow-md">
                              <Eye className="h-4 w-4" />
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", info.bg, info.color)}>
                            <IconComponent className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-xs text-foreground truncate group-hover:text-primary transition-colors" title={file.name}>
                              {file.name}
                            </h4>
                            <div className="mt-0.5 text-[10px] font-mono text-muted-foreground">
                              {formatBytes(file.size)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
                          {isImage ? (
                            <button
                              onClick={() => setPreviewImage({ src: file.data, name: file.name })}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                              title="Preview"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenFile(file)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                              title="Open with Default App"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDownloadFile(file)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Export / Download"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteFileTarget(file)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                            title="Delete File"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
                      <Badge className={cn("text-[10px] font-medium px-1.5 py-0 bg-transparent", info.color, "border-current/30")}>
                        {info.label}
                      </Badge>
                      <span className="font-mono text-[10px]">
                        {new Date((file.updated_at || Date.now() / 1000) * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* LIST / TABLE VIEW */
            <div className="rounded-2xl border border-border/80 bg-card/60 overflow-hidden divide-y divide-border/50">
              {/* Note Rows */}
              {visibleNotes.map((note) => (
                <div
                  key={`list-note-${note.id}`}
                  onClick={() => setActiveEditingNote(note)}
                  className="flex items-center justify-between px-4 py-3 hover:bg-accent/40 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition-all duration-200">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-foreground truncate group-hover:text-sky-500 transition-colors">
                        {note.title || "Untitled Note"}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {note.content.replace(/<[^>]*>/g, "").slice(0, 70) || "Empty note…"}
                      </div>
                    </div>
                  </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                      <Badge className="text-[10px] font-medium border-sky-500/30 text-sky-500 bg-sky-500/10">
                        Note
                      </Badge>
                      <span className="font-mono text-[11px] hidden sm:inline">
                        {new Date((note.updated_at || Date.now() / 1000) * 1000).toLocaleDateString()}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteNoteTarget(note);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                        title="Delete Note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

              {/* Uploaded File Rows */}
              {visibleFiles.map((file) => {
                const info = getFileIcon(file.name, file.mime);
                const IconComponent = info.icon;
                const isImage = file.mime.startsWith("image/");

                return (
                  <div
                    key={`list-file-${file.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors group cursor-pointer"
                    onClick={() => {
                      if (isImage) {
                        setPreviewImage({ src: file.data, name: file.name });
                      } else {
                        handleOpenFile(file);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {isImage ? (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage({ src: file.data, name: file.name });
                          }}
                          className="group/thumb relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-black/40 cursor-pointer"
                        >
                          <img src={file.data} alt="" className="h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                            <Eye className="h-3 w-3 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", info.bg, info.color)}>
                          <IconComponent className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-foreground truncate group-hover:text-primary transition-colors" title={file.name}>
                          {file.name}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {formatBytes(file.size)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Badge className={cn("text-[10px] font-medium bg-transparent", info.color, "border-current/30")}>
                        {info.label}
                      </Badge>
                      <span className="font-mono text-[11px] hidden sm:inline">
                        {new Date((file.updated_at || Date.now() / 1000) * 1000).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-1">
                        {isImage ? (
                          <button
                            onClick={() => setPreviewImage({ src: file.data, name: file.name })}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Preview Image"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenFile(file)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Open with Default App"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDownloadFile(file)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteFileTarget(file)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Image Lightbox Preview Modal */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="max-w-3xl rounded-2xl p-4 bg-background/95 backdrop-blur-xl border border-border/80">
            <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50">
              <DialogTitle className="text-sm font-bold truncate max-w-md">
                {previewImage.name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center p-4 max-h-[70vh] overflow-hidden">
              <img
                src={previewImage.src}
                alt={previewImage.name}
                className="max-h-[65vh] max-w-full rounded-xl object-contain shadow-2xl"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = previewImage.src;
                  a.download = previewImage.name;
                  a.click();
                }}
                className="rounded-xl gap-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Save to Disk</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create / Rename Folder Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingFolder ? "Rename Folder" : "New Folder"}</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Folder Name
            </label>
            <Input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g. Work, Financials, Tax Records"
              className="rounded-xl"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveFolder();
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setFolderDialogOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleSaveFolder} className="rounded-xl">
              {editingFolder ? "Save" : "Create Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Dialog */}
      <Dialog open={!!deleteFolderTarget} onOpenChange={(open) => !open && setDeleteFolderTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            Are you sure you want to delete folder{" "}
            <span className="font-bold text-foreground">"{deleteFolderTarget?.name}"</span>?
            <p className="mt-2 text-xs text-amber-500">
              Note: Documents and notes inside this folder will NOT be deleted; they will be moved to root.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteFolderTarget(null)} className="rounded-xl">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteFolder} className="rounded-xl">
              Delete Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete File Dialog */}
      <Dialog open={!!deleteFileTarget} onOpenChange={(open) => !open && setDeleteFileTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            Permanently delete <span className="font-bold text-foreground">"{deleteFileTarget?.name}"</span>?
            This action cannot be undone.
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteFileTarget(null)} className="rounded-xl">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteFile} className="rounded-xl">
              Delete File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Note Dialog */}
      <Dialog open={!!deleteNoteTarget} onOpenChange={(open) => !open && setDeleteNoteTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            Permanently delete note <span className="font-bold text-foreground">"{deleteNoteTarget?.title}"</span>?
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteNoteTarget(null)} className="rounded-xl">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteNote} className="rounded-xl">
              Delete Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
