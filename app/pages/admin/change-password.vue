<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'Ubah kata sandi' })
</script>

<template>
  <div class="w-full max-w-2xl mx-auto">
    <CommandBar title="Ubah kata sandi" />
    <ChangePasswordForm audience="staff" />
  </div>
</template>
