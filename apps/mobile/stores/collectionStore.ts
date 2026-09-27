import { create } from 'zustand';

interface CollectionState {
  currentSubjectId: string | null;
  formData: Record<string, unknown>;
  capturedImages: Record<string, string>; // fieldName -> filePath

  setCurrentSubject: (id: string | null) => void;
  setFormField: (name: string, value: unknown) => void;
  setFormData: (data: Record<string, unknown>) => void;
  setCapturedImage: (fieldName: string, filePath: string) => void;
  reset: () => void;
}

export const useCollectionStore = create<CollectionState>((set) => ({
  currentSubjectId: null,
  formData: {},
  capturedImages: {},

  setCurrentSubject: (id) => set({ currentSubjectId: id }),
  setFormField: (name, value) =>
    set((state) => ({ formData: { ...state.formData, [name]: value } })),
  setFormData: (data) => set({ formData: data }),
  setCapturedImage: (fieldName, filePath) =>
    set((state) => ({
      capturedImages: { ...state.capturedImages, [fieldName]: filePath },
    })),
  reset: () =>
    set({ currentSubjectId: null, formData: {}, capturedImages: {} }),
}));
