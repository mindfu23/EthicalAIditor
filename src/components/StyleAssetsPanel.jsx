import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  Book,
  FileText,
  Users,
  Globe,
  List,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import {
  listStyleAssets,
  saveStyleAsset,
  deleteStyleAsset,
  AssetTypes,
} from '../services/styles';

const ASSET_TYPE_INFO = {
  [AssetTypes.STYLE_GUIDE]: {
    icon: Book,
    label: 'Style Guides',
    description: 'Voice, tone, and formatting rules',
    fields: ['description', 'rules'],
  },
  [AssetTypes.GLOSSARY]: {
    icon: FileText,
    label: 'Glossary',
    description: 'Term definitions and usage',
    fields: ['term', 'definition', 'usage'],
  },
  [AssetTypes.RULE]: {
    icon: List,
    label: 'Writing Rules',
    description: 'Specific writing guidelines',
    fields: ['rule', 'examples'],
  },
  [AssetTypes.CHARACTER]: {
    icon: Users,
    label: 'Characters',
    description: 'Character profiles and traits',
    fields: ['description', 'traits', 'relationships'],
  },
  [AssetTypes.WORLD]: {
    icon: Globe,
    label: 'World/Setting',
    description: 'World-building details',
    fields: ['description', 'details'],
  },
};

/**
 * StyleAssetsPanel Component
 * 
 * Full panel for managing style assets
 */
export function StyleAssetsPanel({ isOpen, onClose }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedType, setExpandedType] = useState(null);
  const [editingAsset, setEditingAsset] = useState(null);
  const [showNewForm, setShowNewForm] = useState(null);

  // Load assets on mount
  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listStyleAssets();
      setAssets(result.assets || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadAssets();
    }
  }, [isOpen, loadAssets]);

  // Group assets by type
  const assetsByType = assets.reduce((acc, asset) => {
    if (!acc[asset.asset_type]) {
      acc[asset.asset_type] = [];
    }
    acc[asset.asset_type].push(asset);
    return acc;
  }, {});

  const handleSave = async (asset) => {
    try {
      await saveStyleAsset(asset);
      await loadAssets();
      setEditingAsset(null);
      setShowNewForm(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (assetId) => {
    if (!confirm('Delete this asset?')) return;
    try {
      await deleteStyleAsset(assetId);
      await loadAssets();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Style Assets</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(ASSET_TYPE_INFO).map(([type, info]) => {
                const Icon = info.icon;
                const typeAssets = assetsByType[type] || [];
                const isExpanded = expandedType === type;

                return (
                  <div key={type} className="border rounded-lg">
                    {/* Type header */}
                    <button
                      className="w-full flex items-center justify-between p-3 hover:bg-gray-50"
                      onClick={() => setExpandedType(isExpanded ? null : type)}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={20} className="text-gray-500" />
                        <div className="text-left">
                          <div className="font-medium">{info.label}</div>
                          <div className="text-xs text-gray-500">{info.description}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">
                          {typeAssets.length} items
                        </span>
                        {isExpanded ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </div>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t bg-gray-50 p-3">
                        {/* Existing assets */}
                        {typeAssets.map((asset) => (
                          <AssetItem
                            key={asset.id}
                            asset={asset}
                            typeInfo={info}
                            isEditing={editingAsset === asset.id}
                            onEdit={() => setEditingAsset(asset.id)}
                            onCancelEdit={() => setEditingAsset(null)}
                            onSave={(updated) => handleSave({ ...updated, id: asset.id })}
                            onDelete={() => handleDelete(asset.id)}
                          />
                        ))}

                        {/* New asset form */}
                        {showNewForm === type ? (
                          <NewAssetForm
                            type={type}
                            typeInfo={info}
                            onSave={handleSave}
                            onCancel={() => setShowNewForm(null)}
                          />
                        ) : (
                          <button
                            onClick={() => setShowNewForm(type)}
                            className="w-full flex items-center justify-center gap-2 p-3 mt-2 border border-dashed rounded-lg text-gray-500 hover:text-gray-700 hover:border-gray-400"
                          >
                            <Plus size={16} />
                            Add {info.label.replace(/s$/, '')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Individual asset item display/edit
 */
function AssetItem({ asset, typeInfo, isEditing, onEdit, onCancelEdit, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    name: asset.name,
    content: asset.content,
    priority: asset.priority || 0,
    active: asset.active !== false,
  });

  if (isEditing) {
    return (
      <div className="bg-white p-3 rounded-lg border mb-2">
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border rounded mb-2"
          placeholder="Name"
        />
        {typeInfo.fields.map((field) => (
          <div key={field} className="mb-2">
            <label className="text-xs text-gray-500 uppercase">{field}</label>
            <textarea
              value={typeof formData.content[field] === 'object' 
                ? JSON.stringify(formData.content[field]) 
                : formData.content[field] || ''}
              onChange={(e) => setFormData({
                ...formData,
                content: { ...formData.content, [field]: e.target.value },
              })}
              className="w-full px-3 py-2 border rounded"
              rows={2}
            />
          </div>
        ))}
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={onCancelEdit}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(formData)}
            className="px-3 py-1 text-sm bg-sage text-white rounded hover:bg-sage-dark"
          >
            <Save size={14} className="inline mr-1" />
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-3 rounded-lg border mb-2 flex items-start justify-between">
      <div>
        <div className="font-medium">{asset.name}</div>
        <div className="text-sm text-gray-500 mt-1">
          {Object.entries(asset.content || {})
            .filter(([k, v]) => v && typeof v === 'string')
            .map(([k, v]) => v.substring(0, 50))
            .join(' • ')}
        </div>
        {!asset.active && (
          <span className="text-xs text-amber-600">Inactive</span>
        )}
      </div>
      <div className="flex gap-1">
        <button
          onClick={onEdit}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-red-500"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * Form for creating new assets
 */
function NewAssetForm({ type, typeInfo, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    asset_type: type,
    name: '',
    content: {},
    priority: 0,
    active: true,
  });

  return (
    <div className="bg-white p-3 rounded-lg border mt-2">
      <input
        type="text"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        className="w-full px-3 py-2 border rounded mb-2"
        placeholder="Name"
        autoFocus
      />
      {typeInfo.fields.map((field) => (
        <div key={field} className="mb-2">
          <label className="text-xs text-gray-500 uppercase">{field}</label>
          <textarea
            value={formData.content[field] || ''}
            onChange={(e) => setFormData({
              ...formData,
              content: { ...formData.content, [field]: e.target.value },
            })}
            className="w-full px-3 py-2 border rounded"
            rows={2}
            placeholder={`Enter ${field}...`}
          />
        </div>
      ))}
      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={onCancel}
          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(formData)}
          disabled={!formData.name}
          className="px-3 py-1 text-sm bg-sage text-white rounded hover:bg-sage-dark disabled:opacity-50"
        >
          <Plus size={14} className="inline mr-1" />
          Create
        </button>
      </div>
    </div>
  );
}

export default StyleAssetsPanel;
