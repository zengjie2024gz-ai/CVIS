import {CMemoryError} from "./CMemoryError.ts";
import {getTypeSize, PrimitiveType, Type, Location} from "@CMachine/CMachineTypes.ts";

// Default memory layout
// Increased VM memory size for recursive examples
const MEMORY_START: number = 0;
const MEMORY_SIZE: number = 4096;
const DATA_SIZE: number = 256;
const BSS_SIZE: number = 256;

const ALIGNMENT = 4;

const NULL_RESERVED_START = ALIGNMENT; // Used only for the heap 


type MemType = 'stack' | 'heap' | 'bss' | 'data';


export interface MemoryAllocation {
    start: number;
    size: number;
    regionType: MemType;
    type: Type;
    allocated: boolean;
    identifier: string;
    value: any; // STRICTLY FOR TESTING
    location: { line: number, column: number }
}

export interface MemoryAllocationProposal {
    size: number,
    identifier: string,
    type: Type,
    location: Location
    value?: any,
}

export const CProgramLayout = {
    MemoryStart: MEMORY_START,
    MemoryEnd: MEMORY_SIZE,
    StackPointer: MEMORY_SIZE,
    DataPointer: MEMORY_START,
    BSSPointer: MEMORY_START,
    HeapPointer: NULL_RESERVED_START,
    DataMaxSize: DATA_SIZE,
    BSSMaxSize: (MEMORY_START + DATA_SIZE) + BSS_SIZE,
}

interface CProgramLayout {
    MemoryStart: number,
    MemoryEnd: number,
    StackPointer: number,
    DataPointer: number,
    BSSPointer: number,
    HeapPointer: number,
    DataMaxSize: number,
    BSSMaxSize: number,
}

interface InitializationParameters {
    MemorySize: number,
    BSSSize: number,
    DataSize: number,
    Alignment: number
}

export class VirtualMemoryMachine {
    public StackPointer: number = 0;
    public HeapPointer: number = 0;
    public BSSPointer: number = 0;
    public DataPointer: number = 0;
    public MemoryAllocated: MemoryAllocation[] = [];
    public MemorySize: number = 0;
    private InitParams: InitializationParameters;
    private ProgramLayout: CProgramLayout;
    private Memory: ByteMemory;

    constructor(memorySize: number = MEMORY_SIZE, bssSize: number = BSS_SIZE, dataSize: number = DATA_SIZE, alignment: number = ALIGNMENT) {
        this.InitParams = {
            MemorySize: memorySize,
            BSSSize: bssSize,
            DataSize: dataSize,
            Alignment: alignment
        }
        this.resetMemory();
    }

    private setProgramLayout(params: InitializationParameters) {
        this.ProgramLayout = {
            MemoryStart: MEMORY_START,
            MemoryEnd: params.MemorySize,
            StackPointer: params.MemorySize,
            DataPointer: MEMORY_START,
            BSSPointer: MEMORY_START,
            HeapPointer: NULL_RESERVED_START,
            DataMaxSize: params.DataSize,
            BSSMaxSize: (MEMORY_START + params.DataSize) + params.BSSSize
        }
    }

    private resetPointers() {
        this.StackPointer = this.align(this.ProgramLayout.StackPointer, ALIGNMENT);
        this.HeapPointer = this.ProgramLayout.HeapPointer;
        this.BSSPointer = this.ProgramLayout.BSSPointer;
        this.DataPointer = this.ProgramLayout.DataPointer;
    }

    resetMemory() {
        if (this.InitParams === undefined) {
            throw new CMemoryError('Memory Initialization Error', 'Initialization parameters not set');
        }
        this.setProgramLayout(this.InitParams);
        this.resetPointers();
        this.MemoryAllocated = [];
        this.MemorySize = this.InitParams.MemorySize;
        this.Memory = new ByteMemory(MEMORY_SIZE);
    }

    getAlignmentForType(type: Type): number {

        if (type.primitiveType === PrimitiveType.STRUCT) {
            return 4;
        }

        return getTypeSize(type);
    }

    align(address: number, alignment: number): number {
        return (address + (alignment - 1)) & ~(alignment - 1);
    }

    processGlobalDeclaration(proposal: MemoryAllocationProposal[]): number[] {
        return proposal.map((prop) => this.allocateGlobalData(prop.size, prop.identifier, prop.type, prop.location, prop.value));
    }

    allocateGlobalData(size: number, identifier: string, type: Type, location: Location, value?: any): number {

        if (!size || !identifier || !type)
            throw new CMemoryError('Data Allocation Error', 'Size, identifier and type must be provided');

        const alignment = this.getAlignmentForType(type);

        if (value === undefined) {

            const alignedAddress = this.align(this.BSSPointer, alignment);

            // Check if it will overflow the BSS size
            if (alignedAddress + size >= CProgramLayout.DataMaxSize + CProgramLayout.BSSMaxSize) {
                throw new CMemoryError('Data Overflow', 'The data section has reached its limit');
            }
            // Allocaate on bss
            const address = alignedAddress;
            this.BSSPointer += alignedAddress + size;
            this.HeapPointer = this.BSSPointer;
            return this.allocateMemory(address, size, value, 'bss', identifier, type, undefined, location);
        } else {

            const alignedAddress = this.align(this.DataPointer, alignment);

            // Check if it will overflow the data size
            if (alignedAddress + size >= CProgramLayout.MemoryStart + CProgramLayout.DataMaxSize) {
                throw new CMemoryError('Data Overflow', 'The data section has reached its limit');
            }

            // Allocate on data
            const address = alignedAddress;
            this.DataPointer += alignedAddress + size;
            this.BSSPointer = this.DataPointer;
            this.HeapPointer = this.BSSPointer;
            return this.allocateMemory(address, size, value, 'data', identifier, type, undefined, location);
        }
    }

    allocateOnStack(size: number, identifier: string, value: any, type: Type, location: Location, strictStartAddress?: number, existing: boolean = false): number {

        if (!size || !identifier)
            throw new CMemoryError('Stack Allocation Error', 'Size and identifier must be provided');

        // Align the address
        const alignment = this.getAlignmentForType(type);


        // Stack grows down therefore we need to subtract the size
        let address = this.StackPointer - size;


        // Align through bitwise AND to lowest address which is multiple of alignment
        address = address & ~(alignment - 1);

        // Check if the new stack pointer is within the stack range
        if (address <= this.HeapPointer) {
            throw new CMemoryError('Stack Overflow', 'The stack has reached its limit');
        }

        // Update the stack pointer

        if (!strictStartAddress) {
            this.StackPointer = address;
            return this.allocateMemory(address, size, value, 'stack', identifier, type, existing, location);
        } else
            return this.allocateMemory(strictStartAddress, size, value, 'stack', identifier, type, existing, location);
    }

    allocateOnHeap(size: number, identifier: string, value: any = null, type: Type, location: Location): number {
        if (!size || !identifier)
            throw new CMemoryError('Heap Allocation Error', 'Size and identifier must be provided');

        const alignment = this.getAlignmentForType(type);

        // Sort allocation to find gaps
        const heapAllocations = this.MemoryAllocated.filter(alloc =>
            alloc.regionType === 'heap' && alloc.allocated);

        if (heapAllocations.length === 0) {
            // No existing allocations, use the heap pointer directly
            const alignedAddress = this.align(this.HeapPointer, alignment);
            const newEndAddress = alignedAddress + size;

            // Check for overflow
            if (newEndAddress >= this.StackPointer) {
                throw new CMemoryError('Heap Overflow', 'The heap has reached its limit');
            }

            // Allocate memory
            this.writeAllocationMemory(alignedAddress, size, value, 'heap', identifier, type, location);
            this.HeapPointer = newEndAddress;
            return alignedAddress;
        }

        // Sort allocations for gap search
        heapAllocations.sort((a, b) => a.start - b.start);

        // Check for a gap at the beginning
        let currentAddress = this.HeapPointer;
        const firstAlloc = heapAllocations[0];
        const alignedStartAddress = this.align(currentAddress, alignment);

        if (alignedStartAddress + size <= firstAlloc.start) {
            // Gap found at the beginning
            this.writeAllocationMemory(alignedStartAddress, size, value, 'heap', identifier, type, location);
            return alignedStartAddress;
        }

        // Check for gaps between allocations
        for (let i = 0; i < heapAllocations.length - 1; i++) {
            const currentAlloc = heapAllocations[i];
            const nextAlloc = heapAllocations[i + 1];

            // Calculate gap start (end of current allocation)
            currentAddress = currentAlloc.start + currentAlloc.size;
            const alignedAddress = this.align(currentAddress, alignment);

            // Check if there's enough space in this gap
            if (alignedAddress + size <= nextAlloc.start) {
                // Found a suitable gap
                this.writeAllocationMemory(alignedAddress, size, value, 'heap', identifier, type, location);
                return alignedAddress;
            }
        }

        // No gaps found, allocate after the last allocation
        const lastAlloc = heapAllocations[heapAllocations.length - 1];
        currentAddress = lastAlloc.start + lastAlloc.size;
        const alignedAddress = this.align(currentAddress, alignment);
        const newEndAddress = alignedAddress + size;

        // Check for overflow
        if (newEndAddress >= this.StackPointer) {
            throw new CMemoryError('Heap Overflow', 'The heap has reached its limit');
        }

        // Allocate after the last allocation
        this.writeAllocationMemory(alignedAddress, size, value, 'heap', identifier, type, location);
        this.HeapPointer = newEndAddress;

        return alignedAddress;
    }

    reallocateMemory(address: number, newSize: number, type: Type, location: Location): number {
        const addressInfo = this.getMemoryInfo(address);

        // Check it's possible
        if (!addressInfo || !addressInfo.allocated || addressInfo.regionType !== 'heap') {
            throw new CMemoryError('Reallocation Error', 'No valid heap address found');
        }

        // Is reducing the size
        if (newSize < addressInfo.size) {
            addressInfo.size = newSize;
            return addressInfo.start;
        }

        // Gets the data
        const value = this.readMemory(address, addressInfo.type);

        this.freeMemory(address)

        // Increases the size
        const newAddress = this.allocateOnHeap(newSize, addressInfo.identifier, value, type, location);

        return newAddress;
    }

    freeMemory(address: number): void {
        const index = this.MemoryAllocated.findIndex(r => r.start === address);
        if (index === -1) {
            throw new CMemoryError('Reallocation Error', `Attempted to free invalid memory address ${index}`);
        }

        // Remove the allocation
        const range = this.MemoryAllocated[index];

        if (range.regionType === "stack") {
            this.MemoryAllocated.splice(index, 1);

            const stackAllocations = this.MemoryAllocated.filter((allocation) => {
                return allocation.regionType=== "stack";
            });

            if (stackAllocations.length === 0) {
                this.StackPointer = this.ProgramLayout.StackPointer;
            } else {
                let lowestStackAddress = stackAllocations[0].start;
                for (let i = 1; i < stackAllocations.length; i++) {
                    if (stackAllocations[i].start < lowestStackAddress) {
                        lowestStackAddress = stackAllocations[i].start;
                    }
                }
                this.StackPointer = lowestStackAddress;
            }

            return;
        }

        if (range.regionType === "heap" && range.start + range.size === this.HeapPointer) {
            this.HeapPointer = range.start;
        }

        this.MemoryAllocated.splice(index, 1);
    }

    getMemoryInfo(address: number): MemoryAllocation | null {
        return this.MemoryAllocated.find(r => r.start <= address && address < r.start + r.size) || null;
    }



    getHeapDump() {
        return this.MemoryAllocated.filter(r => r.regionType === 'heap');
    }

    writeMemory(address: number, type: Type, value: any): void {

        // Check memory is allocated to see if it can be written to
        const range = this.getMemoryInfo(address);
        if (!range || !range.allocated) {
            throw new CMemoryError('Memory Write Error', `Attempted to write to unallocated memory at ${address}`);
        }

        if (type.pointerLevel > 0) {
            // Pointer type, write the address as INT (32 bit system)
            this.Memory.writeInt(address, value);
            return;
        }

        switch (type.primitiveType) {
            case PrimitiveType.CHAR:
                this.Memory.writeByte(address, value);
                break;
            case PrimitiveType.INT:
                this.Memory.writeInt(address, value);
                break;
            case PrimitiveType.FLOAT:
                this.Memory.writeFloat(address, value);
                break;
            case PrimitiveType.DOUBLE:
                this.Memory.writeDouble(address, value);
                break;
            case PrimitiveType.STRUCT:
                this.Memory.writeByte(address, value);
                break;
            default:
                throw new CMemoryError('Memory Write Error', `Invalid memory type ${type.primitiveType}`);
        }
    }

    writeAllocationMemory(address: number, size: number, value: any, regionType: MemType, identifier: string, type: Type, location: {
        line: number,
        column: number
    }): number {
        this.MemoryAllocated.push({
            start: address,
            size,
            regionType,
            type,
            value,
            allocated: true,
            identifier,
            location
        });

        if (value !== null && value !== undefined) {
            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    let offset = i * getTypeSize(type);
                    if (offset < size) {
                        this.writeMemory(address + offset, type, value[i]);
                    }
                }
            } else {
                this.writeMemory(address, type, value);
            }
        } else {
            for (let i = 0; i < size; i++) {
                this.Memory.writeByte(address + i, 0);
            }
        }

        return address;
    }

    readMemory(address: number, type: Type): number {

        // Check memory is allocated (can't read to unallocated memory)
        const range = this.getMemoryInfo(address);
        if (!range || !range.allocated) {
            throw new CMemoryError('Memory Write Error', `Attempted to read unallocated memory at 0x${address.toString(16).padStart(8, '0')}`);
        }

        if (type.pointerLevel > 0) {
            // Pointer type, read the address as INT (32 bit system)
            return this.Memory.readInt(address);
        }

        switch (type.primitiveType) {
            case PrimitiveType.CHAR:
                return this.Memory.readByte(address);
            case PrimitiveType.INT:
            case PrimitiveType.STRUCT:
                return this.Memory.readInt(address);
            case PrimitiveType.FLOAT:
                return this.Memory.readFloat(address);
            case PrimitiveType.DOUBLE:
                return this.Memory.readDouble(address);
            default:
                throw new CMemoryError('Memory Read Error', `Invalid memory type ${type.primitiveType}`);
        }
    }

    getMemory(): ByteMemory {
        return this.Memory;
    }

    readMemorySegment(address: number, size: number): number[] {
        const output = [];
        for (let i = 0; i < size; i++) {
            output.push(this.Memory.readByte(address + i));
        }
        return output;
    }

    readString(address: number): string {
        return this.Memory.readString(address);
    }

    getAllocations(): MemoryAllocation[] {
        return this.MemoryAllocated;
    }

    private allocateMemory(address: number, size: number, value: any, regionType: MemType, identifier: string, type: Type, overwrite: boolean = false, location: {
        line: number,
        column: number
    }): number {

        if (!overwrite) {
            this.MemoryAllocated.push({
                start: address,
                size,
                regionType,
                type,
                value,
                allocated: true,
                identifier,
                location
            });
        }

        // console.log('Allocated', identifier, 'at', address, 'of size', size, 'in', regionType);

        // Check if the size is the true size of the data
        if (Array.isArray(value) && value.length * getTypeSize(type) !== size) {
            throw new CMemoryError('Memory Allocation Error', 'Allocation size does not fit the value');
        }

        // Check if value is 1 dimensional array
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                let offset = i * getTypeSize(type);
                this.writeMemory(address + offset, type, value[i]);
                // console.log('Writing', String.fromCharCode(value[i]), 'to', address + offset, 'Memory: ', String.fromCharCode(this.Memory.readByte(address + offset)));
            }
        } else {
            // console.log('Writing', value, 'to', address);
            this.writeMemory(address, type, value);
        }

        // Write the value to memory
        return address;
    }


}

export class ByteMemory {
    private memory: Uint8Array;

    constructor(size: number) {
        this.memory = new Uint8Array(size);
    }

    readByte(address: number): number {
        if (address < 0 || address >= this.memory.length) {
            throw new CMemoryError('Segmentation Fault', `Address ${address} out of bounds`);
        }
        return this.memory[address];
    }

    writeByte(address: number, data: number): void {
        if (address < 0 || address >= this.memory.length) {
            throw new CMemoryError('Segmentation Fault', `Address ${address} out of bounds`);
        }
        // Ensure byte
        this.memory[address] = data & 0xFF;
        // console.log("Written", address, data, " to ", this.memory[address]);
    }

    readInt(address: number): number {
        // read first byte, shift accross a byte, read next. Or to combine the bytes
        return this.readByte(address) | (this.readByte(address + 1) << 8) | (this.readByte(address + 2) << 16) | (this.readByte(address + 3) << 24);
    }

    writeInt(address: number, data: number): void {
        // write first byte, shift accross a byte, write next byte
        this.writeByte(address, data & 0xFF);
        this.writeByte(address + 1, (data >> 8) & 0xFF);
        this.writeByte(address + 2, (data >> 16) & 0xFF);
        this.writeByte(address + 3, (data >> 24) & 0xFF);


    }

    readString(address: number, length: number = 256): string {
        let output = '';
        // read until null terminator
        for (let i = 0; i < length; i++) {
            const char = this.readByte(address + i);
            if (char === 0 || i > 250) break;
            output += String.fromCharCode(char);

        }
        return output;
    }

    readFloat(address: number): number {

        let byteBuffer = new ArrayBuffer(4);
        let floatView = new DataView(byteBuffer);

        floatView.setUint8(0, this.readByte(address));
        floatView.setUint8(1, this.readByte(address + 1));
        floatView.setUint8(2, this.readByte(address + 2));
        floatView.setUint8(3, this.readByte(address + 3));

        return floatView.getFloat32(0, true);
    }

    writeFloat(address: number, data: number): void {
        let byteBuffer = new ArrayBuffer(4);
        let floatView = new DataView(byteBuffer);

        floatView.setFloat32(0, data, true);

        this.writeByte(address, floatView.getUint8(0));
        this.writeByte(address + 1, floatView.getUint8(1));
        this.writeByte(address + 2, floatView.getUint8(2));
        this.writeByte(address + 3, floatView.getUint8(3));
    }

    writeDouble(address: number, data: number): void {
        let byteBuffer = new ArrayBuffer(8);
        let floatView = new DataView(byteBuffer);

        floatView.setFloat64(0, data, true);

        this.writeByte(address, floatView.getUint8(0));
        this.writeByte(address + 1, floatView.getUint8(1));
        this.writeByte(address + 2, floatView.getUint8(2));
        this.writeByte(address + 3, floatView.getUint8(3));
        this.writeByte(address + 4, floatView.getUint8(4));
        this.writeByte(address + 5, floatView.getUint8(5));
        this.writeByte(address + 6, floatView.getUint8(6));
        this.writeByte(address + 7, floatView.getUint8(7));
    }

    readDouble(address: number): number {
        let byteBuffer = new ArrayBuffer(8);
        let floatView = new DataView(byteBuffer);

        for (let i = 0; i < 8; i++) {
            floatView.setUint8(i, this.readByte(address + i));
        }

        return floatView.getFloat64(0, true);
    }

    writeString(address: number, data: string): void {
        for (let i = 0; i < data.length; i++) {
            this.writeByte(address + i, data.charCodeAt(i));
        }

        this.writeByte(address + data.length, 0);
    }

    getMemory() {
        return this.memory;
    }
}
