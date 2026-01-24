'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  useCreateCategory,
  useUpdateCategory,
  useCategories,
  useCreateFeaturedCategory,
} from '@/hooks';
import type { Category } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
  FormField,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import { getLocalizedText } from '@/lib/utils';
import { CategoryPreview } from './category-preview';

const categorySchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  parent_id: z.string().nullable().optional(),
  name_en: z.string().min(1, 'English name is required'),
  name_ka: z.string().optional(),
  description_en: z.string().optional(),
  description_ka: z.string().optional(),
  icon: z.string().optional(),
  image_url: z.string().url().optional().or(z.literal('')),
  visibility: z.enum(['active', 'draft']),
  is_featured: z.boolean(),
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface CategoryFormProps {
  category?: Category;
  onSuccess?: () => void;
}

export function CategoryForm({ category, onSuccess }: CategoryFormProps) {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const createFeatured = useCreateFeaturedCategory();

  const [activeLang, setActiveLang] = useState<'en' | 'ka'>('en');

  const isEditing = !!category;

  // Compute default values from category prop (form will remount via key prop when category changes)
  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: category
      ? {
          slug: category.slug,
          parent_id: category.parent_id,
          name_en: category.name.en || '',
          name_ka: category.name.ka || '',
          description_en: category.description?.en || '',
          description_ka: category.description?.ka || '',
          icon: category.icon || '',
          image_url: category.image_url || '',
          visibility: category.is_active ? 'active' : 'draft',
          is_featured: false,
        }
      : {
          slug: '',
          parent_id: null,
          name_en: '',
          name_ka: '',
          description_en: '',
          description_ka: '',
          icon: '',
          image_url: '',
          visibility: 'active',
          is_featured: false,
        },
  });

  const watched = useWatch({
    control: form.control,
  });

  const {
    slug: _slug,
    name_en: nameEn,
    name_ka: nameKa,
    description_en: descEn,
    description_ka: descKa,
    icon,
    image_url: imageUrl,
    visibility,
    parent_id: parentId,
  } = watched;

  const previewName = activeLang === 'ka' ? nameKa : nameEn;
  const previewDescription = activeLang === 'ka' ? descKa : descEn;

  const previewParentLabel = useMemo(() => {
    if (!parentId || parentId === 'none') return 'Root';
    const parent = categories?.find((c) => c.id === parentId);
    return parent ? getLocalizedText(parent.name, parent.slug) : 'Parent';
  }, [categories, parentId]);

  // Filter out current category from parent options
  const parentOptions = categories?.filter((c) => c.id !== category?.id) || [];

  async function onSubmit(data: CategoryFormData) {
    try {
      const isActive = data.visibility === 'active';
      const payload = {
        slug: data.slug,
        parent_id: data.parent_id || null,
        name: {
          en: data.name_en,
          ...(data.name_ka && { ka: data.name_ka }),
        },
        description:
          data.description_en || data.description_ka
            ? {
                ...(data.description_en && { en: data.description_en }),
                ...(data.description_ka && { ka: data.description_ka }),
              }
            : null,
        icon: data.icon || null,
        image_url: data.image_url || null,
        is_active: isActive,
      };

      if (isEditing) {
        await updateCategory.mutateAsync({ id: category.id, data: payload });
        toast.success('Category updated successfully');
      } else {
        const newCategory = await createCategory.mutateAsync(payload);

        // Add to featured if requested
        if (data.is_featured) {
          await createFeatured.mutateAsync({ category_id: newCategory.id });
        }

        toast.success('Category created successfully');
      }

      onSuccess?.();
    } catch {
      toast.error(isEditing ? 'Failed to update category' : 'Failed to create category');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <CategoryPreview
          name={previewName}
          description={previewDescription}
          icon={icon}
          imageUrl={imageUrl}
          activeLang={activeLang}
          onLanguageChange={setActiveLang}
        />

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <FormField
            control={form.control}
            name={activeLang === 'ka' ? 'name_ka' : 'name_en'}
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                  Name ({activeLang === 'ka' ? 'KA' : 'EN'})
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={activeLang === 'ka' ? 'ქართული სახელი' : 'Category name'}
                    className="h-10 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={activeLang === 'ka' ? 'description_ka' : 'description_en'}
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                  Description ({activeLang === 'ka' ? 'KA' : 'EN'})
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={activeLang === 'ka' ? 'ქართული აღწერა' : 'Short description (optional)'}
                    className="h-10 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Slug</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="slug" 
                    className="h-10 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl" 
                    {...field} 
                  />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="parent_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Parent</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                  value={field.value || 'none'}
                >
                  <FormControl>
                    <SelectTrigger className="h-10 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="rounded-xl border-white/10 bg-background/80 backdrop-blur-xl shadow-2xl">
                    <SelectItem value="none">No parent</SelectItem>
                    {parentOptions.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {getLocalizedText(cat.name, cat.slug)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="icon"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Icon</FormLabel>
                <FormControl>
                  <Input placeholder="✨" className="h-10 text-center shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl" {...field} />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="visibility"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-10 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="rounded-xl border-white/10 bg-background/80 backdrop-blur-xl shadow-2xl">
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="image_url"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Cover Image URL</FormLabel>
                <FormControl>
                  <Input placeholder="https://..." className="h-10 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl" {...field} />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />
        </div>

        {!isEditing && (
          <FormField
            control={form.control}
            name="is_featured"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-xl border border-white/10 p-3 bg-white/5 backdrop-blur-md">
                <FormControl>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border/50 text-primary focus:ring-primary/30"
                    checked={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-0.5">
                  <FormLabel className="text-xs font-semibold">Feature this category</FormLabel>
                  <FormDescription className="text-[10px] text-muted-foreground/70 leading-none">
                    Adds it to your featured collection.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        )}

        <div className="pt-2">
          {isEditing ? (
            <Button
              type="submit"
              disabled={createCategory.isPending || updateCategory.isPending}
              className="w-full h-11 rounded-xl font-bold shadow-lg shadow-primary/20"
            >
              {updateCategory.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="submit"
                disabled={createCategory.isPending || updateCategory.isPending}
                className="h-11 rounded-xl font-bold shadow-lg shadow-primary/20"
                onClick={() => form.setValue('visibility', 'active')}
              >
                {createCategory.isPending ? 'Creating…' : 'Create Category'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={createCategory.isPending || updateCategory.isPending}
                className="h-11 rounded-xl font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
                onClick={() => {
                  form.setValue('visibility', 'draft');
                  void form.handleSubmit(onSubmit)();
                }}
              >
                Save as Draft
              </Button>
            </div>
          )}
        </div>
      </form>
    </Form>
  );
}
