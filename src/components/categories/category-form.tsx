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
import { DEFAULT_LANGUAGE } from '@/lib/constants';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Globe,
  Image as ImageIcon,
  Sparkles,
  Users,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  visibility: z.enum(['active', 'draft', 'hidden']),
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

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
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

  // Populate form when editing
  useEffect(() => {
    if (category) {
      form.reset({
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
      });
    }
  }, [category, form]);

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
    return parent ? parent.name[DEFAULT_LANGUAGE] || parent.slug : 'Parent';
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="relative group overflow-hidden rounded-[2rem] border border-white/10 aspect-[21/9] w-full shadow-2xl">
          {/* Background Layer */}
          <div className="absolute inset-0 bg-[#0a0a0a]">
            {imageUrl ? (
              <>
                <img src={imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
              </>
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-primary/20 via-primary/5 to-black" />
            )}
          </div>

          {/* Content Layer */}
          <div className="relative h-full w-full p-6 flex flex-col justify-between">
            {/* Top Row */}
            <div className="flex items-start justify-between">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-xl">
                <span className="text-3xl leading-none">{icon || '✨'}</span>
              </div>
              
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 bg-[#22c55e] text-white px-3 py-1.5 rounded-lg shadow-lg">
                  <Trophy className="w-4 h-4" />
                  <span className="text-xs font-black tracking-tighter">#52</span>
                </div>
              </div>
            </div>

            {/* Bottom Row */}
            <div className="flex items-end justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-2xl font-black tracking-tight text-white truncate drop-shadow-md">
                  {previewName || 'New Category'}
                </h3>
                <p className="mt-1 text-sm text-white/70 line-clamp-1 font-medium max-w-[80%]">
                  {previewDescription || 'Experience the ultimate challenge in this category.'}
                </p>
                
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg transition-transform hover:scale-105">
                    <Users className="w-3.5 h-3.5 text-white/60" />
                    <span className="text-xs font-bold text-white tracking-tight">24.8k</span>
                  </div>
                  <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg transition-transform hover:scale-105">
                    <TrendingUp className="w-3.5 h-3.5 text-white/60" />
                    <span className="text-xs font-bold text-white tracking-tight">2450</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">Category Identity</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name={activeLang === 'ka' ? 'name_ka' : 'name_en'}
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Name ({activeLang === 'ka' ? 'KA' : 'EN'})
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={activeLang === 'ka' ? 'ქართული სახელი' : 'Category name'}
                      className="h-11 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={activeLang === 'ka' ? 'description_ka' : 'description_en'}
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Description ({activeLang === 'ka' ? 'KA' : 'EN'})
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={activeLang === 'ka' ? 'ქართული აღწერა' : 'Short description (optional)'}
                      className="h-11 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Slug</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="my-category-slug" 
                    className="h-11 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl" 
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="parent_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parent Category</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                  value={field.value || 'none'}
                >
                  <FormControl>
                    <SelectTrigger className="h-11 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl">
                      <SelectValue placeholder="Select parent" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="rounded-xl border-white/10 bg-background/80 backdrop-blur-xl shadow-2xl">
                    <SelectItem value="none">No parent</SelectItem>
                    {parentOptions.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name[DEFAULT_LANGUAGE] || cat.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 px-1">
            <ImageIcon className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">Visual Identity</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="icon"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Icon</FormLabel>
                  <FormControl>
                    <Input placeholder="✨" className="h-11 text-center shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl" {...field} />
                  </FormControl>
                  <FormDescription className="text-[11px] text-muted-foreground/70 ml-1">
                    Tip: Press Ctrl + Cmd + Space to pick an emoji.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
          </div>

          <FormField
            control={form.control}
            name="image_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Cover Image URL</FormLabel>
                <FormControl>
                  <Input placeholder="https://..." className="h-11 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">Visibility</h3>
          </div>

          <FormField
            control={form.control}
            name="visibility"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-11 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="rounded-xl border-white/10 bg-background/80 backdrop-blur-xl shadow-2xl">
                    <SelectItem value="active">Active (Visible)</SelectItem>
                    <SelectItem value="draft">Draft (Not visible)</SelectItem>
                    <SelectItem value="hidden">Hidden (Internal)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {!isEditing && (
          <FormField
            control={form.control}
            name="is_featured"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-2xl border border-white/10 p-5 bg-white/5 backdrop-blur-md">
                <FormControl>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border/50 text-primary focus:ring-primary/30"
                    checked={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1">
                  <FormLabel className="text-sm font-semibold">Feature this category</FormLabel>
                  <FormDescription className="text-xs text-muted-foreground/70">
                    Adds it to your featured collection for faster discovery.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        )}

        {!isEditing && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground/70">
              Publishing makes the category visible to players. Draft keeps it private until you’re ready.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="submit"
                disabled={createCategory.isPending || updateCategory.isPending}
                className="h-12 rounded-2xl font-bold shadow-lg shadow-primary/20"
                onClick={() => form.setValue('visibility', 'active')}
              >
                {createCategory.isPending || updateCategory.isPending ? 'Creating…' : 'Create Category'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={createCategory.isPending || updateCategory.isPending}
                className="h-12 rounded-2xl font-semibold bg-white/5 border border-white/10 hover:bg-white/10"
                onClick={() => {
                  form.setValue('visibility', 'draft');
                  void form.handleSubmit(onSubmit)();
                }}
              >
                Save as Draft
              </Button>
            </div>
          </div>
        )}

        {isEditing && (
          <Button
            type="submit"
            disabled={createCategory.isPending || updateCategory.isPending}
            className="w-full h-12 rounded-2xl font-bold shadow-lg shadow-primary/20"
          >
            {updateCategory.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        )}
      </form>
    </Form>
  );
}
