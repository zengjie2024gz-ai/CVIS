import {describe, expect, it} from 'vitest';
import {ByteMemory, MemoryAllocation, VirtualMemoryMachine} from "@CMachine/CMemory.ts";
import {getPrimitiveTypeSize, PrimitiveType} from "@CMachine/CMachineTypes.ts";

describe('Memory Tests', () => {

    describe('Virtual Memory', () => {

        describe('Constructor', () => {
            it('should create a VirtualMemoryMachine instance with correct pointers', () => {
                const memory = new VirtualMemoryMachine(512, 128, 128, 4);
                expect(memory).toBeInstanceOf(VirtualMemoryMachine);

                expect(memory.StackPointer).toEqual(512);
                expect(memory.HeapPointer).toEqual(4);
                expect(memory.BSSPointer).toEqual(0);
                expect(memory.DataPointer).toEqual(0);
                expect(memory.MemorySize).toEqual(512);
                expect(memory.MemoryAllocated).toEqual([]);

            });

            it('should create a VirtualMemoryMachine instance with correct pointers for different size', () => {
                const memory = new VirtualMemoryMachine(12, 2, 2, 4);
                expect(memory).toBeInstanceOf(VirtualMemoryMachine);

                expect(memory.StackPointer).toEqual(12);
                expect(memory.HeapPointer).toEqual(4);
                expect(memory.BSSPointer).toEqual(0);
                expect(memory.DataPointer).toEqual(0);
                expect(memory.MemorySize).toEqual(12);
                expect(memory.MemoryAllocated).toEqual([]);

            });
        });

        describe('Read and Write', () => {
            it('should allocate an initialised global variables', () => {
                const memory = new VirtualMemoryMachine(512, 128, 128, 4);
                const address = memory.allocateGlobalData(4, "foo", {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0

                }, {column: 0, line: 0}, 10);

                expect(address).toBe(0);

                let allocation = memory.MemoryAllocated.filter(allocation => allocation.start === address)[0];

                expect(allocation).toBeDefined();
                expect(allocation).toEqual({
                    start: 0,
                    size: 4,
                    identifier: 'foo',
                    allocated: true,
                    regionType: 'data',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    location: {column: 0, line: 0},
                    value: 10
                } as MemoryAllocation);

                let byteMemory = memory.getMemory();

                expect(byteMemory.readInt(address)).toBe(10);
            });

            it('should allocate an uninitialised global variables', () => {
                const memory = new VirtualMemoryMachine(512, 128, 128, 4);
                const address = memory.allocateGlobalData(4, "foo", {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });

                expect(address).toBe(0);

                let allocation = memory.MemoryAllocated.filter(allocation => allocation.start === address)[0];

                expect(allocation).toBeDefined();
                expect(allocation).toEqual({
                    start: 0,
                    size: 4,
                    identifier: 'foo',
                    allocated: true,
                    regionType: 'bss',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    location: undefined,
                    value: undefined
                });

            });

            it('should allocate on the stack', () => {
                const memory = new VirtualMemoryMachine(512, 128, 128, 4);
                const address = memory.allocateOnStack(4, "foo", 10, {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });

                expect(address).toBe(508);

                let allocation = memory.MemoryAllocated.filter(allocation => allocation.start === address)[0];

                expect(allocation).toBeDefined();

                expect(allocation).toEqual({
                    start: 508,
                    size: 4,
                    identifier: 'foo',
                    allocated: true,
                    regionType: 'stack',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    value: 10
                } as MemoryAllocation);

                let byteMemory = memory.getMemory();

                expect(byteMemory.readInt(address)).toBe(10);

            });

            it('should allocate multiple variables on the stack while aligning', () => {
                const memory = new VirtualMemoryMachine(512, 128, 128, 4);
                const address1 = memory.allocateOnStack(getPrimitiveTypeSize(PrimitiveType.INT), "foo", 10, {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });
                const address2 = memory.allocateOnStack(getPrimitiveTypeSize(PrimitiveType.CHAR), "bar", 'a', {
                    primitiveType: PrimitiveType.CHAR,
                    pointerLevel: 0
                });
                const address3 = memory.allocateOnStack(getPrimitiveTypeSize(PrimitiveType.INT), "baz", 10, {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });

                expect(address1).toBe(508);
                expect(address2).toBe(507);
                expect(address3).toBe(500);

                let allocation1 = memory.MemoryAllocated.filter(allocation => allocation.start === address1)[0];
                let allocation2 = memory.MemoryAllocated.filter(allocation => allocation.start === address2)[0];
                let allocation3 = memory.MemoryAllocated.filter(allocation => allocation.start === address3)[0];

                expect(allocation1).toBeDefined();
                expect(allocation2).toBeDefined();
                expect(allocation3).toBeDefined();

                expect(allocation1).toEqual({
                    start: 508,
                    size: 4,
                    identifier: 'foo',
                    allocated: true,
                    regionType: 'stack',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    value: 10
                } as MemoryAllocation);

                expect(allocation2).toEqual({
                    start: 507,
                    size: 1,
                    identifier: 'bar',
                    allocated: true,
                    regionType: 'stack',
                    type: {primitiveType: PrimitiveType.CHAR, pointerLevel: 0},
                    value: 'a'
                } as MemoryAllocation);

                expect(allocation3).toEqual({
                    start: 500,
                    size: 4,
                    identifier: 'baz',
                    allocated: true,
                    regionType: 'stack',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    value: 10
                } as MemoryAllocation);
            });

            it('should allocate on the heap', () => {
                const memory = new VirtualMemoryMachine(512, 128, 128, 4);
                const address = memory.allocateOnHeap(4, "foo", 10, {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });

                expect(address).toBe(4);

                let allocation = memory.MemoryAllocated.filter(allocation => allocation.start === address)[0];

                expect(allocation).toBeDefined();

                expect(allocation).toEqual({
                    start: 4,
                    size: 4,
                    identifier: 'foo',
                    allocated: true,
                    regionType: 'heap',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    value: 10
                } as MemoryAllocation);

                let byteMemory = memory.getMemory();

                expect(byteMemory.readInt(address)).toBe(10);
            });

            it('should allocate multiple variables on the heap while aligning', () => {
                const memory = new VirtualMemoryMachine(512, 128, 128, 4);
                const address1 = memory.allocateOnHeap(getPrimitiveTypeSize(PrimitiveType.INT), "foo", 10, {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });
                const address2 = memory.allocateOnHeap(getPrimitiveTypeSize(PrimitiveType.INT), "bar", 10, {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });
                const address3 = memory.allocateOnHeap(getPrimitiveTypeSize(PrimitiveType.INT), "baz", 10, {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });

                expect(address1).toBe(4);
                expect(address2).toBe(8);
                expect(address3).toBe(12);

                let allocation1 = memory.MemoryAllocated.filter(allocation => allocation.start === address1)[0];
                let allocation2 = memory.MemoryAllocated.filter(allocation => allocation.start === address2)[0];
                let allocation3 = memory.MemoryAllocated.filter(allocation => allocation.start === address3)[0];

                expect(allocation1).toBeDefined();
                expect(allocation2).toBeDefined();
                expect(allocation3).toBeDefined();

                expect(allocation1).toEqual({
                    start: 4,
                    size: 4,
                    identifier: 'foo',
                    allocated: true,
                    regionType: 'heap',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    value: 10
                } as MemoryAllocation);

                expect(allocation2).toEqual({
                    start: 8,
                    size: 4,
                    identifier: 'bar',
                    allocated: true,
                    regionType: 'heap',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    value: 10
                } as MemoryAllocation);

                expect(allocation3).toEqual({
                    start: 12,
                    size: 4,
                    identifier: 'baz',
                    allocated: true,
                    regionType: 'heap',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    value: 10
                } as MemoryAllocation);
            });

            it('should use first gap when assigning heap memory', () => {
                const memory = new VirtualMemoryMachine(512, 128, 128, 4);
                const address1 = memory.allocateOnHeap(getPrimitiveTypeSize(PrimitiveType.INT), "foo", 10, {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });
                const address2 = memory.allocateOnHeap(getPrimitiveTypeSize(PrimitiveType.CHAR), "bar", 'a', {
                    primitiveType: PrimitiveType.CHAR,
                    pointerLevel: 0
                });
                const address3 = memory.allocateOnHeap(getPrimitiveTypeSize(PrimitiveType.INT), "baz", 10, {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });

                expect(address1).toBe(4);
                expect(address2).toBe(8);
                expect(address3).toBe(12);

                memory.freeMemory(address2);

                const address4 = memory.allocateOnHeap(getPrimitiveTypeSize(PrimitiveType.INT), "qux", 15, {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });

                expect(address4).toBe(8);

                let allocation1 = memory.MemoryAllocated.filter(allocation => allocation.start === address1)[0];
                let allocation3 = memory.MemoryAllocated.filter(allocation => allocation.start === address3)[0];
                let allocation4 = memory.MemoryAllocated.filter(allocation => allocation.start === address4)[0];

                expect(allocation1).toBeDefined();
                expect(allocation3).toBeDefined();
                expect(allocation4).toBeDefined();

                expect(allocation1).toEqual({
                    start: 4,
                    size: 4,
                    identifier: 'foo',
                    allocated: true,
                    regionType: 'heap',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    location: undefined,
                    value: 10
                });

                expect(allocation3).toEqual({
                    start: 12,
                    size: 4,
                    identifier: 'baz',
                    allocated: true,
                    regionType: 'heap',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    value: 10
                } as MemoryAllocation);


                expect(allocation4).toEqual({
                    start: 8,
                    size: 4,
                    identifier: 'qux',
                    allocated: true,
                    regionType: 'heap',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    value: 15
                });


            });

            it('should be able reallocate memory to a large size', () => {
                const memory = new VirtualMemoryMachine(512, 128, 128, 4);
                let address = memory.allocateOnHeap(getPrimitiveTypeSize(PrimitiveType.INT), "foo", 10, {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });

                address = memory.reallocateMemory(address, 8, {primitiveType: PrimitiveType.INT, pointerLevel: 0});

                let allocation = memory.MemoryAllocated.filter(allocation => allocation.start === address)[0];

                expect(allocation).toBeDefined();

                expect(allocation).toEqual({
                    start: 4, // shifted
                    size: 8,
                    identifier: 'foo',
                    allocated: true,
                    regionType: 'heap',
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                    value: 10
                } as MemoryAllocation);

            });
        });


        describe('Helper Functions', () => {
            it('should read multiple byte segments', () => {
                const memory = new VirtualMemoryMachine(10, 2, 2, 4);
                const address = memory.allocateOnHeap(getPrimitiveTypeSize(PrimitiveType.INT), "foo", 4294967295, {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                });

                expect(address).toBe(4);

                let values = memory.readMemorySegment(address, 4);

                expect(values).toEqual([0xFF, 0xFF, 0xFF, 0xFF]);

            });

        });

    });

    describe('Byte Memory', () => {
        it('should read and write values to memory', () => {
            const memory = new ByteMemory(5);
            const address = 0x0000;

            memory.writeByte(address, 0x007B);
            expect(memory.readByte(address)).toBe(0x007B);
        });

        it('should read and write a series of values to memory', () => {
            const memory = new ByteMemory(10);
            const address = 0x0000;

            for (let i = 0; i < 10; i++) {
                memory.writeByte(address + i, i);
            }

            for (let i = 0; i < 10; i++) {
                expect(memory.readByte(address + i)).toBe(i);
            }
        });

        it('should read and write integers to memory', () => {
            const memory = new ByteMemory(5);
            const address = 0x0000;

            memory.writeInt(address, 0x007B);
            expect(memory.readInt(address)).toBe(0x007B);
        });

        it('should read and write floats to memory', () => {
            const memory = new ByteMemory(5);
            const address = 0x0000;

            memory.writeFloat(address, 3.14);
            expect(memory.readFloat(address)).toBeCloseTo(3.14, 5);
        });

        it('should read and write strings to memory', () => {
            const memory = new ByteMemory(10);
            const address = 0x0000;

            memory.writeString(address, "Hello");
            expect(memory.readString(address)).toBe("Hello");
        });

        it('should read and write doubles to memory', () => {
            const memory = new ByteMemory(10);
            const address = 0x0000;

            memory.writeDouble(address, 3.14);
            expect(memory.readDouble(address)).toBeCloseTo(3.14, 5);

        });

        it('should return a memory dump', () => {
            const memory = new ByteMemory(10);
            const address = 0x0000;

            for (let i = 0; i < 10; i++) {
                memory.writeByte(address + i, i);
            }

            const dump = memory.getMemory();

            expect(dump.length).toBe(10);

            for (let i = 0; i < 10; i++) {
                expect(dump[i]).toBe(i);
            }

        });

        it('should throw an error for an invalid read', () => {
            const memory = new ByteMemory(5);
            const address = 0x0006;

            expect(() => {
                memory.readByte(address);
            }).toThrow("Segmentation Fault: Address 6 out of bounds");
        });

        it('should throw an error for an invalid write', () => {
            const memory = new ByteMemory(0);
            const address = 0x0000;

            expect(() => {
                memory.writeByte(address, 0x007B);
            }).toThrow("Segmentation Fault: Address 0 out of bounds");

        });
    });

});
